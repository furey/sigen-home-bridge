import { chromium } from 'playwright'

const BASE = (process.env.SIGEN_URL || 'http://localhost:5163').replace(/\/$/, '')
const OUT = process.env.SCREENSHOT_OUT || '/work/docs/screenshots'
const TIMEZONE = process.env.SCREENSHOT_TZ || 'Australia/Sydney'

const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, hasTouch: true },
  phonePortrait: {
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  },
  phoneLandscape: {
    viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  }
}

const DASHBOARD_VIEW = { trends: false, range: '1h', hidden: [] }
const TRENDS_VIEW = { trends: true, range: '24h', hidden: [] }

const run = async () => {
  const group = process.argv[2] || 'all'
  const wants = (name) => group === 'all' || group === name
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })

  if (wants('data')) {
    const live = await daytimeState()
    for (const shot of dataShots) {
      const state = shot.inject ? live : null
      await capture(() => shotViewport(browser, { ...shot, state }), shot.file)
    }
  }

  if (wants('settings')) for (const shot of settingsShots) {
    const take = shot.kind === 'full'
      ? () => shotSettingsFull(browser, shot)
      : () => shotSettingsCrop(browser, shot)
    await capture(take, shot.file)
  }

  if (wants('wizard')) await capture(() => shotWizard(browser), 'wizard-gateway.png')

  await browser.close()
}

const dataShots = [
  { profile: 'desktop', path: '/', file: 'dashboard-desktop.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'tablet', path: '/', file: 'dashboard-tablet.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'phonePortrait', path: '/', file: 'dashboard-phone-portrait.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'phoneLandscape', path: '/', file: 'dashboard-phone-landscape.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'desktop', path: '/trends', file: 'trends-desktop.png', view: TRENDS_VIEW, prep: selectWidestRange },
  { profile: 'tablet', path: '/trends', file: 'trends-tablet.png', view: TRENDS_VIEW, prep: selectWidestRange },
  { profile: 'phonePortrait', path: '/trends', file: 'trends-phone-portrait.png', view: TRENDS_VIEW, prep: selectWidestRange },
  { profile: 'phoneLandscape', path: '/trends', file: 'trends-phone-landscape.png', view: TRENDS_VIEW, prep: selectWidestRange },
  { profile: 'desktop', path: '/metric/solar', file: 'fullscreen-solar-desktop.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'tablet', path: '/metric/solar', file: 'fullscreen-solar-tablet.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'phonePortrait', path: '/metric/solar', file: 'fullscreen-solar-phone-portrait.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'phoneLandscape', path: '/metric/solar', file: 'fullscreen-solar-phone-landscape.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'desktop', path: '/cost', file: 'fullscreen-cost-desktop.png', view: DASHBOARD_VIEW, inject: true },
  { profile: 'desktop', path: '/devices', file: 'devices-desktop.png', view: DASHBOARD_VIEW, inject: true, clip: clipToArticle }
]

const settingsShots = [
  { kind: 'full', route: '/settings/theme', file: 'settings-appearance.png' },
  { kind: 'full', route: '/settings/gateway', file: 'settings-connection.png', prep: sanitizeGateway },
  { kind: 'full', route: '/settings/alerts', file: 'settings-alerts.png' },
  { kind: 'crop', route: '/settings/apple-home', file: 'settings-apple-home.png', prep: sanitizeApple },
  { kind: 'crop', route: '/settings/google-home', file: 'settings-google-home.png' }
]

const shotViewport = async (browser, { profile, path, file, view, prep, state, clip }) => {
  const { context, page } = await newPage(browser, PROFILES[profile], view, state)
  await open(page, path)
  if (prep) await prep(page)
  const options = { path: `${OUT}/${file}` }
  if (clip) options.clip = await clip(page)
  await page.screenshot(options)
  await context.close()
}

const shotSettingsFull = async (browser, { route, prep, file }) => {
  const measuring = { viewport: { width: 1280, height: 2400 }, deviceScaleFactor: 2 }
  const { context, page } = await newPage(browser, measuring, {})
  await open(page, route, 1800)
  if (prep) await prep(page)
  await wait(page, 500)
  const { needed } = await settingsGeometry(page)
  await page.setViewportSize({ width: 1280, height: needed + 2 })
  await wait(page, 500)
  await scrollMainToTop(page)
  const main = await mainBox(page)
  await page.screenshot({ path: `${OUT}/${file}`, clip: { x: main.left, y: 0, width: main.width, height: main.height } })
  await context.close()
}

const shotSettingsCrop = async (browser, { route, prep, file }) => {
  const cropping = { viewport: { width: 1280, height: 1300 }, deviceScaleFactor: 2 }
  const { context, page } = await newPage(browser, cropping, {})
  await open(page, route, 1800)
  if (prep) await prep(page)
  await scrollMainToTop(page)
  await wait(page, 400)
  const geo = await page.evaluate(() => {
    const main = document.querySelector('main')
    const rect = main.getBoundingClientRect()
    const nav = main.querySelector('nav')
    const railBottom = nav ? Math.round(nav.getBoundingClientRect().bottom) : 560
    return { left: Math.round(rect.left), width: Math.round(rect.width), railBottom }
  })
  const height = Math.min(920, geo.railBottom + 24)
  await page.screenshot({ path: `${OUT}/${file}`, clip: { x: geo.left, y: 0, width: geo.width, height } })
  await context.close()
}

const shotWizard = async (browser) => {
  const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, {})
  await open(page, '/setup', 1800)
  const getStarted = page.getByRole('button', { name: /Get started/i })
  if (await getStarted.count()) await getStarted.first().click()
  await wait(page, 600)
  await page.getByRole('button', { name: /Test connection/i }).first().click()
  await page.getByText(/Reached gateway/i).first().waitFor({ timeout: 20000 })
  await page.evaluate(() => {
    const host = document.querySelector('input[placeholder="192.168.1.50"]')
    if (host) host.value = '192.168.1.50'
  })
  await page.locator('section.max-w-2xl').first().screenshot({ path: `${OUT}/wizard-gateway.png` })
  await context.close()
}

const daytimeState = async () => {
  const real = await (await fetch(`${BASE}/api/state`)).json()
  const pvPower = 5627
  const loadPower = 420
  const batteryPower = 2400
  const batterySoc = 62
  const gridPower = loadPower + batteryPower - pvPower
  const exportPower = -gridPower
  const device = (real.devices && real.devices[0]) || {}
  return {
    ...real,
    connected: true,
    alerts: [],
    pvPower,
    loadPower,
    batteryPower,
    gridPower,
    batterySoc,
    devices: [{
      ...device,
      type: 'inverter',
      model: device.model || 'SigenStor EC 15.0 TP AU',
      serial: 'SGN-2026-000123',
      unitId: device.unitId || 1,
      status: 'running',
      solarPower: pvPower,
      activePower: Math.round(loadPower + exportPower),
      temperature: device.temperature ?? 38,
      soc: batterySoc,
      soh: device.soh ?? 100,
      strings: [
        { index: 1, power: 2100, voltage: 602, current: 3.5 },
        { index: 2, power: 1980, voltage: 593, current: 3.3 },
        { index: 3, power: 1547, voltage: 611, current: 2.5 }
      ]
    }]
  }
}

async function sanitizeGateway (page) {
  await page.locator('input[placeholder="192.168.1.50"]').first().fill('192.168.1.50')
  const addWindow = page.getByRole('button', { name: /Add window/i })
  if (await addWindow.count()) await addWindow.first().click()
}

async function sanitizeApple (page) {
  const pin = page.locator('input[placeholder="516-35-163"]').first()
  if (await pin.count()) await pin.fill('•••-••-•••')
  const bind = page.locator('input[placeholder="All interfaces"]').first()
  if (await bind.count()) await bind.fill('')
  await page.evaluate(() => document.activeElement && document.activeElement.blur())
}

async function selectWidestRange (page) {
  const pill = page.getByRole('radio', { name: '24h', exact: true })
  if (await pill.count()) await pill.first().click({ timeout: 4000 }).catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll('svg path').length > 3, { timeout: 9000 }).catch(() => {})
  await wait(page, 1000)
}

function clipToArticle (page) {
  return page.evaluate(() => {
    const article = document.querySelector('article')
    const bottom = article ? Math.round(article.getBoundingClientRect().bottom) + 20 : window.innerHeight
    return { x: 0, y: 0, width: window.innerWidth, height: bottom }
  })
}

const settingsGeometry = (page) => page.evaluate(() => {
  const main = document.querySelector('main')
  const footer = main.querySelector('#settings-save-footer')
  const scroll = [...main.children].find((child) => child !== footer)
  scroll.scrollTo(0, 0)
  const body = scroll.querySelector(':scope > div')
  const bottom = body ? body.getBoundingClientRect().bottom : scroll.getBoundingClientRect().bottom
  return { needed: Math.ceil(bottom + (footer ? footer.offsetHeight : 0) + 1) }
})

const scrollMainToTop = (page) => page.evaluate(() => {
  const scroll = document.querySelector('main')?.children?.[0]
  if (scroll) scroll.scrollTo(0, 0)
})

const mainBox = (page) => page.evaluate(() => {
  const rect = document.querySelector('main').getBoundingClientRect()
  return { left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }
})

const newPage = async (browser, profile, view, state) => {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: Boolean(profile.isMobile),
    hasTouch: Boolean(profile.hasTouch),
    timezoneId: TIMEZONE
  })
  if (state) {
    await context.route('**/api/state', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) }))
  }
  await context.route('**/api/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, passcodeSet: false })
  }))
  await context.addInitScript(({ view, state }) => {
    try { sessionStorage.setItem('sigenSettingsSession', 'screenshot-session') } catch {}
    try { localStorage.setItem('sigenDashboardView', JSON.stringify(view)) } catch {}
    if (state) {
      const data = JSON.stringify(state)
      class FakeEventSource {
        constructor () {
          this.onopen = null
          this.onmessage = null
          this.onerror = null
          this._listeners = {}
          setTimeout(() => {
            if (this.onopen) this.onopen({})
            if (this.onmessage) this.onmessage({ data })
          }, 0)
          this._ping = setInterval(() => {
            (this._listeners.ping || []).forEach((fn) => fn({}))
          }, 10000)
        }
        addEventListener (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn) }
        removeEventListener () {}
        close () { clearInterval(this._ping) }
      }
      window.EventSource = FakeEventSource
    }
  }, { view, state })
  const page = await context.newPage()
  return { context, page }
}

const open = async (page, path, settle = 2600) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  await wait(page, settle)
}

const capture = async (take, file) => {
  try {
    await take()
    console.log('✓', file)
  } catch (error) {
    console.log('✗', file, error.message)
  }
}

const wait = (page, ms) => page.waitForTimeout(ms)

run()
