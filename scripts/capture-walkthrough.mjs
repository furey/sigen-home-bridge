import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = (process.env.SIGEN_URL || 'http://localhost:5163').replace(/\/$/, '')
const OUT = process.env.WALKTHROUGH_FRAMES_DIR || '/frames'
const TIMEZONE = process.env.WALKTHROUGH_TZ || 'Australia/Sydney'
const CHROME_BIN = process.env.CHROME_BIN
const FRAME_COUNT = Number(process.env.WALKTHROUGH_FRAMES || 40)
const FRAME_MS = Number(process.env.WALKTHROUGH_FRAME_MS || 1400)

const DEVICES = {
  desktop: {
    width: 1280,
    height: 800,
    park: [640, 60],
    touch: false,
    blinkSettings: '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    media: [
      { name: 'hover', value: 'hover' }, { name: 'any-hover', value: 'hover' },
      { name: 'pointer', value: 'fine' }, { name: 'any-pointer', value: 'fine' }
    ]
  },
  tablet: {
    width: 1194,
    height: 834,
    park: [597, 60],
    touch: true,
    blinkSettings: '--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2',
    media: [
      { name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' },
      { name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }
    ]
  }
}

const DEVICE = DEVICES[process.env.WALKTHROUGH_DEVICE || 'desktop']
if (!DEVICE) throw new Error(`unknown WALKTHROUGH_DEVICE "${process.env.WALKTHROUGH_DEVICE}"; use desktop or tablet`)
const { width: W, height: H, park: PARK } = DEVICE
const DT = 1000 / 60
const COMMAND_TIMEOUT_MS = 30000
const HOVER_REST = 500
const END_HOLD_MS = 1600
const DASHBOARD_VIEW = { trends: false, mode: 'live', layout: 'combined', range: '1h', hidden: [] }

const run = async () => {
  await mkdir(OUT, { recursive: true })
  const real = await getJson('/api/state')
  const frames = buildFrames(real)
  const origin = await startLoopback({ frames, settings: sanitize(await getJson('/api/settings')) })
  const b = await launch({ bin: CHROME_BIN, port: 9412, args: [...CHROME_ARGS, DEVICE.blinkSettings, 'about:blank'] })
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true, width: W, height: H })
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true })
  const s = (method, params) => b.send(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Network.enable')
  b.on((message) => trackRequest(message))
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })
  await s('Emulation.setTimezoneOverride', { timezoneId: TIMEZONE })
  await s('Emulation.setTouchEmulationEnabled', { enabled: DEVICE.touch, maxTouchPoints: DEVICE.touch ? 5 : 1 })
  await s('Emulation.setEmulatedMedia', { features: DEVICE.media })
  const pointerOverlay = DEVICE.touch ? [installFinger, null] : [installMacCursor, { arrow: ARROW, hand: HAND }]
  for (const [fn, arg] of [[seedPage, { frames, frameMs: FRAME_MS, view: DASHBOARD_VIEW }], pointerOverlay, [installPins, null]]) {
    await s('Page.addScriptToEvaluateOnNewDocument', { source: `(${fn})(${JSON.stringify(arg)})` })
  }
  const driver = createDriver({ b, s, sessionId })
  try {
    await driver.preroll(`${origin}/`)
    await driver.record(tour)
  } catch (error) {
    console.error(String(error.stack || error))
    process.exitCode = 1
  } finally {
    b.close()
    process.exit()
  }
}

const tour = async ({ hold, hoverOn, clickOn, glide, pumpUntil, sweep, mark }) => {
  const fullscreenBack = DEVICE.touch ? visible('[aria-label="Back to dashboard"]') : FULLSCREEN_BACK
  await mark('dashboard')
  await hold(500)
  await hoverOn(tile('Home'), { rest: 450 })
  await clickOn(tile('Solar Production'))
  await pumpUntil(fullscreenBack, 3000, 'solar fullscreen')
  await hold(1800)
  await clickOn(fullscreenBack, { rest: 450 })
  await pumpUntil(tile('Solar Production'), 3000, 'dashboard')
  await hold(400)

  await mark('trends now')
  await clickOn(visible('[aria-label="Toggle trends view"]'))
  await pumpUntil(CHART_READY, 8000, 'now chart')
  await hold(500)
  await sweep(0.35, 0.92, 1400)
  await mark('trends day')
  await clickOn(periodButton('Day'))
  await pumpUntil(CHART_READY, 8000, 'day chart')
  await hold(300)
  await clickOn(visible('[aria-label="Earlier"]'))
  await pumpUntil(`${CHART_READY} && document.body.textContent.includes('Yesterday')`, 8000, 'yesterday chart')
  await sweep(0.28, 0.62, 1600)
  await hold(300)

  await mark('trends week')
  await clickOn(periodButton('Week'))
  await pumpUntil(CHART_READY, 8000, 'week bars')
  await hold(500)
  await sweep(0.2, 0.64, 1000)
  await hold(300)
  await clickOn(STAGE, { fx: 0.64, fy: 0.5, rest: 200 })
  await pumpUntil(`${CHART_READY} && ${periodButton('Day')}?.getAttribute('aria-pressed') === 'true'`, 8000, 'opened day')
  await hold(1200)

  await mark('trends lanes')
  await clickOn(visible('[aria-label="Lanes"]'))
  await hold(800)
  await sweep(0.3, 0.6, 1200)
  await hold(400)
  await clickOn(visible('[aria-label="Combined"]'))
  await hold(500)
  await clickOn(visible('[aria-label="Toggle trends view"]'))
  await pumpUntil(tile('Solar Production'), 3000, 'dashboard after trends')
  await hold(500)

  await mark('devices')
  await clickOn(visible('[aria-label="Devices"]'))
  await pumpUntil(visible('article'), 3000, 'devices')
  await hold(1800)
  await clickOn(visible('[aria-label="Back to dashboard"]'))
  await pumpUntil(tile('Solar Production'), 3000, 'dashboard after devices')
  await hold(400)

  await mark('settings')
  await clickOn(visible('[aria-label="Settings"]'))
  await pumpUntil(railLink('Theme'), 4000, 'settings rail')
  await hold(400)
  await clickOn(railLink('Theme'))
  await hold(1400)
  await clickOn(railLink('Apple Home'))
  await hold(1400)
  await clickOn(BACK_BUTTON)
  await pumpUntil(tile('Solar Production'), 4000, 'dashboard after settings')

  await mark('home')
  await glide(PARK)
}

const createDriver = ({ b, s, sessionId }) => {
  const clock = { virtual: false }
  const mouse = { x: PARK[0], y: PARK[1] }
  const log = []
  let ticks = realTicks()
  let n = 0
  let recording = false
  let touching = false

  const ev = async (expression) => {
    const reply = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (reply.exceptionDetails) throw new Error(`${reply.exceptionDetails.exception?.description || reply.exceptionDetails.text}\n  in: ${expression.slice(0, 160)}`)
    return reply.result.value
  }

  const dispatch = (event) => event.touch
    ? s('Input.dispatchTouchEvent', { type: event.touch, touchPoints: event.touch === 'touchEnd' ? [] : [{ x: mouse.x, y: mouse.y }] })
    : s('Input.dispatchMouseEvent', { x: mouse.x, y: mouse.y, ...event })

  const step = async (events = []) => {
    if (clock.virtual) await advanceVirtualTime({ b, s })
    ticks += DT
    if (DEVICE.touch) await ev(`window.__finger && window.__finger(${mouse.x}, ${mouse.y})`)
    events.forEach((event) => dispatch(event).catch((error) => console.log(`  input failed: ${error.message}`)))
    const frame = await b.send('HeadlessExperimental.beginFrame', {
      frameTimeTicks: ticks,
      interval: DT,
      noDisplayUpdates: false,
      ...(recording ? { screenshot: { format: 'jpeg', quality: 92 } } : {})
    }, sessionId)
    if (!clock.virtual) await new Promise((done) => setTimeout(done, 16))
    if (!recording || !frame.screenshotData) return
    await writeFile(`${OUT}/${String(n).padStart(5, '0')}.jpg`, Buffer.from(frame.screenshotData, 'base64'))
    n += 1
  }

  const hold = async (ms) => { for (let i = 0; i < Math.round(ms / DT); i++) await step() }

  const pumpUntil = async (expression, ms, label) => {
    for (let i = 0; i < Math.round(ms / DT); i++) {
      if (await ev(`!!(${expression})`)) return true
      await step()
    }
    throw new Error(`timed out waiting for ${label}`)
  }

  const moveEvent = () => {
    if (!DEVICE.touch) return [{ type: 'mouseMoved' }]
    return touching ? [{ touch: 'touchMove' }] : []
  }

  const glide = async ([tx, ty], ms) => {
    const [fx, fy] = [mouse.x, mouse.y]
    const distance = Math.hypot(tx - fx, ty - fy)
    if (distance < 1) return
    const frames = Math.round((ms ?? Math.min(1000, Math.max(420, 360 + distance * 0.5))) / DT)
    for (let i = 1; i <= frames; i++) {
      const p = easeInOut(i / frames)
      mouse.x = fx + (tx - fx) * p
      mouse.y = fy + (ty - fy) * p
      await step(moveEvent())
    }
  }

  const centreOf = async (expression, { fx = 0.5, fy = 0.5 } = {}) => {
    const point = await ev(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width * ${fx}, r.y + r.height * ${fy}] })()`)
    if (!point) throw new Error(`no element: ${expression}`)
    return point
  }

  const hoverOn = async (expression, { rest = HOVER_REST, ...where } = {}) => {
    await glide(await centreOf(expression, where))
    await hold(rest)
  }

  const press = async () => {
    await hold(100)
    if (!DEVICE.touch) {
      await step([{ type: 'mousePressed', button: 'left', clickCount: 1 }])
      await step([{ type: 'mouseReleased', button: 'left', clickCount: 1 }])
      return
    }
    await ev(`window.__tapRipple(${mouse.x}, ${mouse.y})`)
    await step([{ touch: 'touchStart' }])
    await hold(50)
    await step([{ touch: 'touchEnd' }])
  }

  const clickOn = async (expression, options = {}) => {
    await hoverOn(expression, { rest: 250, ...options })
    await press()
  }

  const sweep = async (from, to, ms) => {
    const [x0, y] = await centreOf(STAGE, { fx: from, fy: 0.45 })
    const [x1] = await centreOf(STAGE, { fx: to, fy: 0.45 })
    await glide([x0, y])
    if (!DEVICE.touch) return glide([x1, y], ms)
    await ev(`window.__fingerDown(true)`)
    await step([{ touch: 'touchStart' }])
    touching = true
    await glide([x1, y], ms)
    touching = false
    await step([{ touch: 'touchEnd' }])
    await ev(`window.__fingerDown(false)`)
  }

  const mark = async (label) => {
    console.log(`  ${label} at frame ${n}`)
    log.push({ mark: label, n })
  }

  const preroll = async (url) => {
    s('Page.navigate', { url })
    await pumpUntil(tile('Solar Production'), 30000, 'dashboard')
    await ev('document.fonts.load(\'600 32px "Inter Variable"\')')
    await pumpUntil('document.fonts.check(\'600 32px "Inter Variable"\')', 9000, 'Inter')
    await step(moveEvent())
    await hold(1500)
    await s('Emulation.setVirtualTimePolicy', { policy: 'pause' })
    ticks = Math.max(ticks, realTicks())
    clock.virtual = true
    await hold(FRAME_MS + 200)
    console.log(`pinned "${await ev('window.__pin()')}"`)
    await hold(300)
  }

  const record = async (script) => {
    recording = true
    const started = Date.now()
    await ev('window.__playFrames()')
    await script({ hold, hoverOn, clickOn, glide, pumpUntil, sweep, mark })
    await ev('window.__restFrames()')
    await hold(FRAME_MS + 200)
    await hold(END_HOLD_MS)
    await mark('end')
    await writeFile(`${OUT}/log.json`, JSON.stringify(log))
    console.log(`captured ${n} frames in ${Math.round((Date.now() - started) / 1000)} s real`)
  }

  return { preroll, record }
}

const advanceVirtualTime = async ({ b, s }) => {
  const expired = b.once('Emulation.virtualTimeBudgetExpired')
  await s('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: DT })
  const stalled = new Promise((_, reject) => setTimeout(() => reject(new Error(`virtual time stalled for 20 s; in flight: ${[...inFlight.values()].join(', ') || 'none'}`)), 20000).unref())
  await Promise.race([expired, stalled])
}

const inFlight = new Map()

const trackRequest = ({ method, params }) => {
  if (method === 'Network.requestWillBeSent') inFlight.set(params.requestId, params.request.url)
  if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') inFlight.delete(params.requestId)
}

const startLoopback = ({ frames, settings }) => new Promise((resolve) => {
  const stubs = {
    '/api/state': frames[0],
    '/api/session': { authenticated: true, passcodeSet: false },
    '/api/settings': settings,
    '/api/homekit/pairing': { uri: '', pin: '•••-••-•••', qr: '' }
  }
  const server = http.createServer(async (request, response) => {
    const path = request.url.split('?')[0]
    if (process.env.WALKTHROUGH_DEBUG) {
      const started = Date.now()
      console.log(`  -> ${request.url}`)
      response.on('finish', () => console.log(`  <- ${response.statusCode} ${request.url} ${Date.now() - started} ms`))
      response.on('close', () => { if (!response.writableFinished) console.log(`  xx closed early ${request.url}`) })
    }
    if (!['GET', 'HEAD'].includes(request.method)) return send(response, 405, 'text/plain', 'read-only capture')
    if (stubs[path]) return send(response, 200, 'application/json', JSON.stringify(stubs[path]))
    const upstream = await forward(request.url)
    if (!upstream) return send(response, 502, 'text/plain', 'upstream unreachable')
    send(response, upstream.status, upstream.type, upstream.body)
  })
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
})

const forward = async (url, attempts = 3) => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const upstream = await fetch(BASE + url, { signal: AbortSignal.timeout(10000) })
      return { status: upstream.status, type: upstream.headers.get('content-type'), body: Buffer.from(await upstream.arrayBuffer()) }
    } catch (error) {
      console.log(`  upstream ${url} failed (${error.message}), attempt ${attempt} of ${attempts}`)
    }
  }
  return null
}

const send = (response, status, type, body) => {
  response.writeHead(status, { 'content-type': type || 'application/octet-stream', 'cache-control': 'no-store' })
  response.end(body)
}

const launch = async ({ bin, port, args }) => {
  const proc = spawn(bin, [`--remote-debugging-port=${port}`, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  let url = null
  for (let i = 0; i < 100 && !url; i++) {
    await new Promise((done) => setTimeout(done, 100))
    url = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j) => j.webSocketDebuggerUrl).catch(() => null)
  }
  const socket = new WebSocket(url)
  await new Promise((done) => socket.addEventListener('open', done))
  const pending = new Map()
  const listeners = []
  let id = 0
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      return message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
    }
    listeners.forEach((listener) => listener(message))
  })
  const sendCommand = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id
    const timer = setTimeout(() => {
      pending.delete(n)
      reject(new Error(`${method} got no reply in ${COMMAND_TIMEOUT_MS / 1000} s`))
    }, COMMAND_TIMEOUT_MS)
    timer.unref()
    const settle = (fn) => (value) => { clearTimeout(timer); fn(value) }
    pending.set(n, { resolve: settle(resolve), reject: settle(reject) })
    socket.send(JSON.stringify({ id: n, method, params, sessionId }))
  })
  const once = (method) => new Promise((resolve) => {
    const listener = (message) => {
      if (message.method !== method) return
      listeners.splice(listeners.indexOf(listener), 1)
      resolve(message.params)
    }
    listeners.push(listener)
  })
  const on = (listener) => listeners.push(listener)
  const close = () => { socket.close(); proc.kill() }
  return { send: sendCommand, once, on, close }
}

const CHROME_ARGS = [
  '--headless', '--no-sandbox', '--enable-begin-frame-control', '--run-all-compositor-stages-before-draw',
  '--deterministic-mode', '--force-device-scale-factor=2', '--hide-scrollbars', '--font-render-hinting=none'
]

const buildFrames = (real) => {
  const base = inverterBase((real.devices && real.devices[0]) || {})
  const smartLoad = (real.devices || []).find((entry) => entry.type === 'smartLoad') || {}
  return Array.from({ length: FRAME_COUNT }, (_, i) => {
    const ramp = FRAME_COUNT === 1 ? 1 : i / (FRAME_COUNT - 1)
    const pvPower = Math.round(5200 + ramp * 1600 + Math.sin(i / 2.3) * 70)
    const smartPortPower = Math.round(3560 + Math.sin(i / 2.1) * 45)
    const loadPower = smartPortPower + Math.round(470 + Math.sin(i / 1.6) * 130 + Math.cos(i / 4) * 40)
    const batteryPower = Math.round(900 + ramp * 400 + Math.sin(i / 3.1) * 70)
    const batterySoc = Number((57.4 + ramp * 9.6).toFixed(1))
    const gridPower = loadPower + batteryPower - pvPower
    const exportPower = -gridPower
    const pvShare = pvPower / STRING_RATIOS.reduce((sum, watts) => sum + watts, 0)
    return {
      ...real,
      connected: true,
      alerts: [],
      outdoorLocation: null,
      outdoorLatitude: null,
      outdoorLongitude: null,
      pvPower,
      loadPower,
      smartPortPower,
      batteryPower,
      gridPower,
      batterySoc,
      devices: [{
        ...base,
        solarPower: pvPower,
        activePower: Math.round(loadPower + exportPower),
        soc: batterySoc,
        temperature: Math.round((base.temperature ?? 38) + Math.sin(i / 5) * 1.5),
        strings: STRING_RATIOS.map((watts, index) => {
          const power = Math.round(watts * pvShare)
          const voltage = 600 + Math.round(Math.sin(i / 3 + index) * 8)
          return {
            index: index + 1,
            name: STRING_NAMES[index + 1],
            power,
            voltage,
            current: Number((power / voltage).toFixed(1))
          }
        })
      }, {
        type: 'smartLoad',
        index: smartLoad.index || 1,
        name: smartLoad.name || 'Hot water',
        power: smartPortPower,
        lifetimeEnergy: smartLoad.lifetimeEnergy ?? 955.63
      }]
    }
  })
}

const inverterBase = (device) => ({
  ...device,
  type: 'inverter',
  model: device.model || 'SigenStor EC 15.0 TP AU',
  serial: SAMPLE_SERIAL,
  unitId: device.unitId || 1,
  status: 'running',
  soh: device.soh ?? 100,
  temperature: device.temperature ?? 38
})

const sanitize = (settings) => ({
  ...settings,
  sigen: { ...settings.sigen, host: '192.168.1.50' },
  homekit: { ...settings.homekit, pin: '•••-••-•••', bind: '' },
  smartLoads: { ...settings.smartLoads, showOnDashboard: true },
  solar: { ...settings.solar, stringNames: { [SAMPLE_SERIAL]: STRING_NAMES } }
})

const SAMPLE_SERIAL = 'SGN-2026-000123'
const STRING_RATIOS = [2100, 1980, 1547]
const STRING_NAMES = { 1: 'North array', 2: 'East array', 3: 'Carport' }

const seedPage = ({ frames, frameMs, view }) => {
  try { sessionStorage.setItem('sigenSettingsSession', 'walkthrough-session') } catch {}
  try { localStorage.setItem('sigenDashboardView', JSON.stringify(view)) } catch {}
  const feed = { index: 0, playing: false }
  window.__playFrames = () => { feed.playing = true }
  window.__restFrames = () => { feed.playing = false; feed.index = 0 }
  class FakeEventSource {
    constructor () {
      this.onopen = null
      this.onmessage = null
      this.onerror = null
      this.listeners = {}
      const emit = () => {
        const frame = frames[feed.index]
        frame.lastUpdated = new Date().toISOString()
        if (this.onmessage) this.onmessage({ data: JSON.stringify(frame) })
        ;(this.listeners.ping || []).forEach((fn) => fn({}))
        if (feed.playing) feed.index = (feed.index + 1) % frames.length
      }
      setTimeout(() => { if (this.onopen) this.onopen({}); emit() }, 0)
      this.timer = setInterval(emit, frameMs)
    }

    addEventListener (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn) }
    removeEventListener () {}
    close () { clearInterval(this.timer) }
  }
  window.EventSource = FakeEventSource
}

const installPins = () => {
  const targets = {
    updated: () => [...document.querySelectorAll('footer span')].filter((el) => el.childElementCount === 0 && el.textContent.startsWith('Updated ')),
    eta: () => [...document.querySelectorAll('.soc-eta > span')],
    cost: () => [...document.querySelectorAll('.quadrants .metric-value')].filter((el) => el.textContent.includes('$'))
  }
  const pinned = new Map()
  const enforce = () => {
    for (const [name, { html, className }] of pinned) {
      for (const el of targets[name]()) {
        if (el.innerHTML !== html) el.innerHTML = html
        if (el.className !== className) el.className = className
      }
    }
  }
  window.__pin = () => {
    for (const [name, find] of Object.entries(targets)) {
      const [el] = find()
      if (el) pinned.set(name, { html: el.innerHTML, className: el.className })
    }
    return [...pinned.keys()].join(', ')
  }
  const watch = () => new MutationObserver(enforce).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch, { once: true })
}

const installFinger = () => {
  const install = () => {
    const style = document.createElement('style')
    style.textContent = `
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important }
      html, body, * { scrollbar-width: none !important }
      #__finger-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647 }
      #__finger {
        position: fixed; left: 0; top: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px;
        transform: translate(-80px, -80px); z-index: 2; will-change: transform;
      }
      #__finger > span {
        display: block; width: 100%; height: 100%; border-radius: 50%;
        background: rgba(255,255,255,0.45); border: 1px solid rgba(255,255,255,0.9);
        box-shadow: 0 2px 10px rgba(0,0,0,0.35); transition: transform 180ms ease;
      }
      #__finger.down > span { transform: scale(0.85) }
      .__tap { position: fixed; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%; box-sizing: border-box; z-index: 1 }
      .__tap-core { border: 5px solid rgba(108,142,222,0.95); animation: __tap-core 620ms cubic-bezier(0.22,0.61,0.36,1) forwards }
      .__tap-wave { border: 3px solid rgba(108,142,222,0.55); animation: __tap-wave 620ms cubic-bezier(0.22,0.61,0.36,1) forwards }
      @keyframes __tap-core { 0% { transform: scale(0.5); opacity: 0 } 16% { transform: scale(1); opacity: 1 } 62% { transform: scale(1); opacity: 1 } 100% { transform: scale(1); opacity: 0 } }
      @keyframes __tap-wave { 0% { transform: scale(1); opacity: 0 } 16% { transform: scale(1); opacity: 0.6 } 100% { transform: scale(2.2); opacity: 0 } }`
    document.head.append(style)
    const layer = document.createElement('div')
    layer.id = '__finger-layer'
    layer.innerHTML = '<div id="__finger"><span></span></div>'
    document.documentElement.append(layer)
    const finger = layer.firstChild
    window.__finger = (x, y) => { finger.style.transform = `translate(${x}px, ${y}px)` }
    window.__fingerDown = (down) => finger.classList.toggle('down', down)
    window.__tapRipple = (x, y) => {
      finger.classList.add('down')
      setTimeout(() => finger.classList.remove('down'), 220)
      for (const variant of ['__tap-core', '__tap-wave']) {
        const ring = document.createElement('span')
        ring.className = `__tap ${variant}`
        ring.style.left = `${x}px`
        ring.style.top = `${y}px`
        layer.append(ring)
        setTimeout(() => ring.remove(), 700)
      }
    }
  }
  if (document.head && document.body) install()
  else document.addEventListener('DOMContentLoaded', install, { once: true })
}

const installMacCursor = ({ arrow, hand }) => {
  const install = () => {
    const style = document.createElement('style')
    style.textContent = '::-webkit-scrollbar{width:0!important;height:0!important}html,body,*{scrollbar-width:none!important}'
      + '#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;contain:layout}'
      + '#__cur>span{position:absolute;display:none;line-height:0}'
      + '#__cur[data-type=default] .arrow,#__cur[data-type=pointer] .hand{display:block}'
    document.head.append(style)
    const cursor = document.createElement('div')
    cursor.id = '__cur'
    cursor.dataset.type = 'default'
    cursor.style.transform = 'translate(-80px,-80px)'
    const sprite = (name, { svg, hotspot, filter }) => `<span class="${name}" style="left:${-hotspot[0]}px;top:${-hotspot[1]}px;filter:${filter}">${svg}</span>`
    cursor.innerHTML = sprite('arrow', arrow) + sprite('hand', hand)
    document.documentElement.append(cursor)
    const at = { x: -80, y: -80 }
    const typeAt = () => {
      const el = document.elementFromPoint(at.x, at.y)
      return el && getComputedStyle(el).cursor === 'pointer' ? 'pointer' : 'default'
    }
    const refresh = () => {
      cursor.style.transform = `translate(${at.x}px,${at.y}px)`
      cursor.dataset.type = typeAt()
    }
    addEventListener('mousemove', (e) => { at.x = e.clientX; at.y = e.clientY; refresh() }, { passive: true, capture: true })
    const tick = () => { refresh(); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }
  if (document.head && document.body) install()
  else document.addEventListener('DOMContentLoaded', install, { once: true })
}

const ARROW = {
  hotspot: [5, 5],
  filter: 'drop-shadow(0 1px 1.8px rgba(0,0,0,.45))',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">'
    + '<path fill="#fff" d="M4 18.421875 L4 2.40625 L15.589844 14.027344 L8.808594 14.027344 L8.398438 14.148438 Z"/>'
    + '<path fill="#fff" d="M13.085938 19.097656 L9.480469 20.632812 L4.796875 9.542969 L8.484375 7.988281 Z"/>'
    + '<path fill="#000" d="M11.75 18.414062 L9.90625 19.191406 L6.808594 11.816406 L8.648438 11.039062 Z"/>'
    + '<path fill="#000" d="M5 4.8125 L5 16.003906 L7.96875 13.136719 L8.398438 12.996094 L13.164062 12.996094 Z"/>'
    + '</svg>'
}

const HAND = {
  hotspot: [13, 8],
  filter: 'drop-shadow(0 1px 0.8px rgba(0,0,0,.5))',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<path fill="#fff" stroke="#000" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" transform="matrix(1,0,0,-1,11.3315,20.3799)" d="M 0.00053125 0.00099375 C -0.284625 0.360369 -0.628375 1.094744 -1.241656 1.985369 C -1.589313 2.489275 -2.452594 3.438494 -2.710406 3.918962 C -2.933063 4.344744 -2.909625 4.53615 -2.858844 4.887712 C -2.761188 5.516619 -2.120563 6.0049 -1.433063 5.938494 C -0.913531 5.891619 -0.472125 5.547869 -0.0775938 5.22365 C 0.160687 5.028337 0.457562 4.649431 0.633344 4.434587 C 0.797406 4.239275 0.836469 4.157244 1.008344 3.926775 C 1.238812 3.618181 1.313031 3.469744 1.223187 3.805681 C 1.152875 4.301775 1.035687 5.149431 0.867719 5.899431 C 0.742719 6.465837 0.711469 6.555681 0.586469 6.989275 C 0.457562 7.454119 0.391156 7.778337 0.270062 8.270525 C 0.188031 8.618181 0.0356875 9.329119 -0.003375 9.731462 C -0.0619688 10.278337 -0.0893125 11.168962 0.258344 11.579119 C 0.535687 11.899431 1.164594 11.997087 1.555219 11.801775 C 2.070844 11.540056 2.359906 10.797869 2.492719 10.500994 C 2.731 9.965837 2.879437 9.34865 3.008344 8.540056 C 3.172406 7.508806 3.473187 6.075212 3.484906 5.774431 C 3.508344 6.145525 3.4185 6.922869 3.481 7.274431 C 3.539594 7.59865 3.809125 7.969744 4.145062 8.071306 C 4.434125 8.157244 4.766156 8.188494 5.063031 8.125994 C 5.375531 8.063494 5.707562 7.836931 5.828656 7.625994 C 6.191937 7.0049 6.19975 5.727556 6.211469 5.797869 C 6.297406 6.172869 6.285687 7.024431 6.496625 7.3799 C 6.63725 7.614275 6.992719 7.825212 7.184125 7.860369 C 7.477094 7.91115 7.840375 7.926775 8.148969 7.868181 C 8.395062 7.8174 8.734906 7.520525 8.82475 7.3799 C 9.0435 7.03615 9.1685 6.063494 9.203656 5.72365 C 9.219281 5.579119 9.277875 6.114275 9.496625 6.458025 C 9.902875 7.09865 11.340375 7.219744 11.395062 5.8174 C 11.4185 5.165056 11.414594 5.196306 11.414594 4.7549 C 11.414594 4.239275 11.402875 3.926775 11.375531 3.551775 C 11.344281 3.153337 11.258344 2.247087 11.133344 1.809587 C 11.047406 1.508806 10.76225 0.833025 10.481 0.426775 C 10.481 0.426775 9.406781 -0.823225 9.289594 -1.385725 C 9.172406 -1.948225 9.211469 -1.952131 9.188031 -2.350569 C 9.164594 -2.749006 9.309125 -3.272444 9.309125 -3.272444 C 9.309125 -3.272444 8.508344 -3.377913 8.07475 -3.3076 C 7.684125 -3.2451 7.19975 -2.467756 7.07475 -2.229475 C 6.902875 -1.90135 6.535687 -1.96385 6.391156 -2.206038 C 6.1685 -2.58885 5.684125 -3.27635 5.340375 -3.319319 C 4.672406 -3.40135 3.289594 -3.350569 2.203656 -3.33885 C 2.203656 -3.33885 2.38725 -2.327131 1.977094 -1.979475 C 1.672406 -1.721663 1.145062 -1.198225 0.832562 -0.920881 Z"/>'
    + '<path fill="none" stroke="#000" stroke-width="0.75" stroke-linecap="round" d="M19.5664 20.7344 L19.5664 17.2773"/>'
    + '<path fill="none" stroke="#000" stroke-width="0.75" stroke-linecap="round" d="M17.5508 20.7461 L17.5352 17.2734"/>'
    + '<path fill="none" stroke="#000" stroke-width="0.75" stroke-linecap="round" d="M15.5547 17.3047 L15.5742 20.7305"/>'
    + '</svg>'
}

const SHOWN = `(el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')`
const tile = (label) => `[...document.querySelectorAll('.quadrants > *')].find((el) => el.textContent.includes(${JSON.stringify(label)}) && ${SHOWN})`
const visible = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => ${SHOWN})`
const periodButton = (label) => `[...document.querySelectorAll('[aria-label="Trends period"] button')].find((el) => el.textContent.trim() === ${JSON.stringify(label)})`
const railLink = (label) => `[...document.querySelectorAll('a')].find((el) => el.textContent.trim() === ${JSON.stringify(label)} && ${SHOWN})`
const BACK_BUTTON = `[...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Back' && ${SHOWN})`
const FULLSCREEN_BACK = `[...document.querySelectorAll('.metric-stage div')].find((el) => el.textContent.trim() === 'Back')`
const STAGE = `document.querySelector('.touch-none.select-none')`
const CHART_READY = `(document.querySelector('.touch-none.select-none svg')?.querySelectorAll('path, rect').length ?? 0) > 3`

const getJson = async (path) => (await fetch(`${BASE}${path}`)).json()
const realTicks = () => Number(process.hrtime.bigint() / 1000n) / 1000
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

run()
