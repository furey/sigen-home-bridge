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

const PARK = { x: 597, y: 96 }
const GLIDE_MS = 780
const BOOKEND_MS = 2200

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
  const startedAt = Date.now()
  let settledAt = startedAt
  try {
    settledAt = await tour(page)
  } catch (error) {
    await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => {})
    throw error
  }
  const video = page.video()
  await context.close()
  await video.saveAs(`${OUT}/${NAME}.webm`)
  await video.delete()
  await browser.close()
  console.log('✓', `${OUT}/${NAME}.webm`)
  console.log(`TOUR_TRIM=${((settledAt - startedAt) / 1000 + 0.4).toFixed(1)}`)
}

const tour = async (page) => {
  await open(page, '/')
  await dashboardTile(page).waitFor({ state: 'visible', timeout: 15000 })
  await parkPointer(page, PARK)
  const settledAt = Date.now()
  await dwell(page, BOOKEND_MS)

  await tap(page, dashboardTile(page), 2400)
  await back(page)

  await tap(page, page.getByLabel('Open cost fullscreen'), 2400)
  await back(page)

  await tap(page, page.getByLabel('Devices'), 2200)
  await back(page)

  await tap(page, page.getByLabel('Toggle trends view'), 1200)
  await tap(page, page.getByRole('radio', { name: '24h', exact: true }), 0)
  await page.waitForFunction(() => document.querySelectorAll('svg path').length > 3, { timeout: 9000 })
    .catch(() => {})
  await dwell(page, 2600)
  await tap(page, page.getByLabel('Toggle trends view'), 1200)

  await tap(page, page.getByLabel('Settings'), 1400)
  await tap(page, page.getByRole('link', { name: 'Theme', exact: true }), 1800)
  await tap(page, page.getByRole('link', { name: 'Gateway', exact: true }), 1800)
  await tap(page, page.getByRole('link', { name: 'Apple Home', exact: true }), 1800)

  await tap(page, page.getByRole('button', { name: 'Back', exact: true }), 0)
  await dashboardTile(page).waitFor({ state: 'visible', timeout: 12000 }).catch(() => {})
  await glide(page, PARK.x, PARK.y)
  await dwell(page, BOOKEND_MS)
  return settledAt
}

const dashboardTile = (page) => page.getByRole('button', { name: /Solar Production/i }).first()

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
          return { index: index + 1, power, voltage, current: Number((power / voltage).toFixed(1)) }
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
  homekit: { ...settings.homekit, pin: '•••-••-•••', bind: '' },
  smartLoads: { ...settings.smartLoads, showOnDashboard: true }
})

const seedPage = ({ frames, frameMs, view }) => {
  try { sessionStorage.setItem('sigenSettingsSession', 'walkthrough-session') } catch {}
  try { localStorage.setItem('sigenDashboardView', JSON.stringify(view)) } catch {}

  const ensureOverlay = () => {
    if (!document.getElementById('wt-overlay-style')) {
      const style = document.createElement('style')
      style.id = 'wt-overlay-style'
      style.textContent = `
        #wt-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
        #wt-pointer {
          position: fixed; left: 0; top: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px;
          transform: translate(-120px, -120px); z-index: 2;
          transition: transform 700ms cubic-bezier(0.25, 0.1, 0.25, 1); will-change: transform;
        }
        #wt-pointer-dot {
          width: 100%; height: 100%; border-radius: 50%;
          background: rgba(255,255,255,0.45); border: 1px solid rgba(255,255,255,0.9);
          box-shadow: 0 2px 10px rgba(0,0,0,0.35); transition: transform 180ms ease;
        }
        #wt-pointer.wt-pointer-press #wt-pointer-dot { transform: scale(0.85); }
        .wt-click {
          position: fixed; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%;
          box-sizing: border-box; z-index: 1;
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
    let overlay = document.getElementById('wt-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'wt-overlay'
      const pointer = document.createElement('div')
      pointer.id = 'wt-pointer'
      pointer.innerHTML = '<div id="wt-pointer-dot"></div>'
      overlay.appendChild(pointer)
      document.body.appendChild(overlay)
    }
    return overlay
  }

  window.__movePointer = (x, y, instant) => {
    ensureOverlay()
    const pointer = document.getElementById('wt-pointer')
    if (instant) {
      pointer.style.transition = 'none'
      pointer.style.transform = `translate(${x}px, ${y}px)`
      pointer.getBoundingClientRect()
      pointer.style.transition = ''
      return
    }
    pointer.style.transform = `translate(${x}px, ${y}px)`
  }

  window.__pressPointer = () => {
    const pointer = document.getElementById('wt-pointer')
    if (!pointer) return
    pointer.classList.add('wt-pointer-press')
    setTimeout(() => pointer.classList.remove('wt-pointer-press'), 220)
  }

  window.__ripple = (x, y) => {
    const overlay = ensureOverlay()
    for (const variant of ['wt-click-core', 'wt-click-wave']) {
      const ring = document.createElement('span')
      ring.className = `wt-click ${variant}`
      ring.style.left = `${x}px`
      ring.style.top = `${y}px`
      overlay.appendChild(ring)
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

const tap = async (page, locator, dwellMs = 1300) => {
  const target = locator.first()
  await target.waitFor({ state: 'visible', timeout: 12000 })
  await target.scrollIntoViewIfNeeded()
  await dwell(page, 180)
  const box = await target.boundingBox()
  if (box) {
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 2)
    await glide(page, x, y)
    await page.evaluate(({ x, y }) => {
      window.__ripple && window.__ripple(x, y)
      window.__pressPointer && window.__pressPointer()
    }, { x, y })
    await dwell(page, 140)
  }
  await target.click()
  if (dwellMs) await dwell(page, dwellMs)
}

const glide = async (page, x, y) => {
  await page.evaluate(({ x, y }) => window.__movePointer && window.__movePointer(x, y), { x, y })
  await dwell(page, GLIDE_MS)
}

const parkPointer = (page, { x, y }) =>
  page.evaluate(({ x, y }) => window.__movePointer && window.__movePointer(x, y, true), { x, y })

const back = (page, dwellMs = 1100) => tap(page, page.getByLabel('Back to dashboard'), dwellMs)

const currentState = async () => (await fetch(`${BASE}/api/state`)).json()

const open = async (page, path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(() => document.fonts.load('600 32px "Inter Variable"')).catch(() => {})
  await page.waitForFunction(() => document.fonts.check('600 32px "Inter Variable"'), { timeout: 9000 })
    .catch(() => { console.log('⚠ Inter Variable did not load for', page.url()) })
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  await dwell(page, 300)
}

const dwell = (page, ms) => page.waitForTimeout(ms)

run()
