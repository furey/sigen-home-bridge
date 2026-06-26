import { chromium } from 'playwright'

const BASE = (process.env.SIGEN_URL || 'http://localhost:5163').replace(/\/$/, '')
const OUT = process.env.WALKTHROUGH_OUT || '/work'
const NAME = process.env.WALKTHROUGH_NAME || 'walkthrough'
const TIMEZONE = process.env.WALKTHROUGH_TZ || 'Australia/Sydney'

const VIEWPORT = { width: 1194, height: 834 }
const SCALE = Number(process.env.WALKTHROUGH_SCALE || 2)
const FRAME_COUNT = Number(process.env.WALKTHROUGH_FRAMES || 34)
const FRAME_MS = Number(process.env.WALKTHROUGH_FRAME_MS || 1400)
const DASHBOARD_VIEW = { trends: false, range: '1h', hidden: [] }

const run = async () => {
  const frames = buildFrames(await currentState())
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    hasTouch: true,
    timezoneId: TIMEZONE,
    recordVideo: { dir: OUT, size: VIEWPORT }
  })
  await context.route('**/api/state', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(frames[0]) }))
  await context.route('**/api/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, passcodeSet: false })
  }))
  await context.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(sanitize(await response.json())) })
  })
  await context.route('**/api/homekit/pairing', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ uri: '', pin: '•••-••-•••', qr: '' })
  }))
  await context.addInitScript(seedPage, { frames, frameMs: FRAME_MS, view: DASHBOARD_VIEW })
  const page = await context.newPage()
  await tour(page)
  const video = page.video()
  await context.close()
  await video.saveAs(`${OUT}/${NAME}.webm`)
  await video.delete()
  await browser.close()
  console.log('✓', `${OUT}/${NAME}.webm`)
}

const tour = async (page) => {
  await open(page, '/', 2200)
  await dwell(page, 3400)

  await tap(page, page.getByRole('button', { name: /Solar Production/i }), 3000)
  await back(page)

  await tap(page, page.getByLabel('Open cost fullscreen'), 3000)
  await back(page)

  await tap(page, page.getByLabel('Devices'), 3200)
  await back(page)

  await tap(page, page.getByLabel('Toggle trends view'), 1600)
  await tap(page, page.getByRole('radio', { name: '24h', exact: true }), 0)
  await page.waitForFunction(() => document.querySelectorAll('svg path').length > 3, { timeout: 9000 })
    .catch(() => {})
  await dwell(page, 2800)
  await tap(page, page.getByLabel('Toggle trends view'), 1300)

  await tap(page, page.getByLabel('Settings'), 1700)
  await tap(page, page.getByRole('link', { name: 'Theme', exact: true }), 2500)
  await tap(page, page.getByRole('link', { name: 'Gateway', exact: true }), 2500)
  await tap(page, page.getByRole('link', { name: 'Apple Home', exact: true }), 2400)

  await tap(page, page.getByRole('button', { name: 'Back', exact: true }), 0)
  await dwell(page, 3200)
}

const buildFrames = (real) => {
  const base = inverterBase((real.devices && real.devices[0]) || {})
  return Array.from({ length: FRAME_COUNT }, (_, i) => {
    const ramp = FRAME_COUNT === 1 ? 1 : i / (FRAME_COUNT - 1)
    const pvPower = Math.round(3900 + ramp * 2250 + Math.sin(i / 2.3) * 70)
    const loadPower = Math.round(470 + Math.sin(i / 1.6) * 130 + Math.cos(i / 4) * 40)
    const batteryPower = Math.round(1550 + ramp * 1250 + Math.sin(i / 3.1) * 70)
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
          return { index: index + 1, power, voltage, current: Number((power / voltage).toFixed(1)) }
        })
      }]
    }
  })
}

const inverterBase = (device) => ({
  ...device,
  type: 'inverter',
  model: device.model || 'SigenStor EC 15.0 TP AU',
  serial: 'SGN-2026-000123',
  unitId: device.unitId || 1,
  status: 'running',
  soh: device.soh ?? 100,
  temperature: device.temperature ?? 38
})

const STRING_RATIOS = [2100, 1980, 1547]

const sanitize = (settings) => ({
  ...settings,
  sigen: { ...settings.sigen, host: '192.168.1.50' },
  homekit: { ...settings.homekit, pin: '•••-••-•••', bind: '' }
})

const seedPage = ({ frames, frameMs, view }) => {
  try { sessionStorage.setItem('sigenSettingsSession', 'walkthrough-session') } catch {}
  try { localStorage.setItem('sigenDashboardView', JSON.stringify(view)) } catch {}

  const ensureRippleLayer = () => {
    if (!document.getElementById('wt-ripple-style')) {
      const style = document.createElement('style')
      style.id = 'wt-ripple-style'
      style.textContent = `
        #wt-ripple-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
        .wt-click {
          position: fixed; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%;
          box-sizing: border-box; pointer-events: none;
        }
        .wt-click-core {
          border: 5px solid rgba(108,142,222,0.95);
          animation: wt-click-core 620ms cubic-bezier(0.22,0.61,0.36,1) forwards;
        }
        .wt-click-wave {
          border: 3px solid rgba(108,142,222,0.55);
          animation: wt-click-wave 620ms cubic-bezier(0.22,0.61,0.36,1) forwards;
        }
        @keyframes wt-click-core {
          0% { transform: scale(0.5); opacity: 0; }
          16% { transform: scale(1); opacity: 1; }
          62% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes wt-click-wave {
          0% { transform: scale(1); opacity: 0; }
          16% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }`
      document.head.appendChild(style)
    }
    let layer = document.getElementById('wt-ripple-layer')
    if (!layer) {
      layer = document.createElement('div')
      layer.id = 'wt-ripple-layer'
      document.body.appendChild(layer)
    }
    return layer
  }

  window.__ripple = (x, y) => {
    const layer = ensureRippleLayer()
    for (const variant of ['wt-click-core', 'wt-click-wave']) {
      const ring = document.createElement('span')
      ring.className = `wt-click ${variant}`
      ring.style.left = `${x}px`
      ring.style.top = `${y}px`
      layer.appendChild(ring)
      setTimeout(() => ring.remove(), 700)
    }
  }

  let frameIndex = 0
  class FakeEventSource {
    constructor () {
      this.onopen = null
      this.onmessage = null
      this.onerror = null
      this._listeners = {}
      const send = () => {
        const frame = frames[Math.min(frameIndex, frames.length - 1)]
        frame.lastUpdated = new Date().toISOString()
        if (this.onmessage) this.onmessage({ data: JSON.stringify(frame) })
        ;(this._listeners.ping || []).forEach((fn) => fn({}))
        if (frameIndex < frames.length - 1) frameIndex++
      }
      setTimeout(() => { if (this.onopen) this.onopen({}); send() }, 0)
      this._timer = setInterval(send, frameMs)
    }
    addEventListener (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn) }
    removeEventListener () {}
    close () { clearInterval(this._timer) }
  }
  window.EventSource = FakeEventSource
}

const tap = async (page, locator, dwellMs = 1200) => {
  const target = locator.first()
  await target.waitFor({ state: 'visible', timeout: 9000 })
  const box = await target.boundingBox()
  if (box) {
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 2)
    await page.evaluate(({ x, y }) => window.__ripple && window.__ripple(x, y), { x, y })
    await dwell(page, 170)
  }
  await target.click()
  if (dwellMs) await dwell(page, dwellMs)
}

const back = (page, dwellMs = 1100) => tap(page, page.getByLabel('Back to dashboard'), dwellMs)

const currentState = async () => (await fetch(`${BASE}/api/state`)).json()

const open = async (page, path, settle = 2200) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  await dwell(page, settle)
}

const dwell = (page, ms) => page.waitForTimeout(ms)

run()
