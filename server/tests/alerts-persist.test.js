import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir = ''
let settings = null
let fetchMock = null

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'sigen-alerts-persist-'))
  process.env.DATA_DIR = dataDir
  settings = settingsWith([alertItem()])
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('../settings.js')
  vi.doUnmock('../history.js')
  vi.restoreAllMocks()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('alert state across a restart', () => {
  it('sends nothing new for an alert still active after the restart', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
    await restart({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
  })

  it('sends the normal cleared edge when the condition cleared during the restart', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    await restart({ soc: 60 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised', 'cleared'])
  })

  it('keeps the active since time across the restart', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    const { state } = await import('../state.js')
    const since = state.alerts[0].since
    await restart({ soc: 10 })
    const restored = await import('../state.js')
    expect(restored.state.alerts[0].since).toBe(since)
  })

  it('restarts the arm delay for a candidate that was pending at the restart', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_MS - TICK_MS)
    await restart({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_MS - TICK_MS)
    expect(events()).toEqual([])
    await vi.advanceTimersByTimeAsync(TICK_MS * 2)
    expect(events()).toEqual(['raised'])
  })

  it('drops saved state for an alert that no longer exists', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    settings = settingsWith([])
    await restart({ soc: 10 })
    expect(savedState()).toEqual({})
  })

  it('starts idle with a log line when the saved file is corrupt', async () => {
    writeFileSync(join(dataDir, 'alerts-state.json'), '{not json')
    await boot({ soc: 10 })
    expect(logged()).toMatch(/alerts-state\.json/)
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
  })

  it('writes the file only when an alert state changes', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    const path = join(dataDir, 'alerts-state.json')
    const first = readFileSync(path, 'utf8')
    rmSync(path)
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(existsSync(path)).toBe(false)
    expect(JSON.parse(first).battery.active).toBe(true)
  })
})

describe('alert state edge cases', () => {
  it('drops a restored state whose trigger type changed', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    settings = settingsWith([alertItem({ trigger: { type: 'batteryAbove', threshold: 90 } })])
    await restart({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
    expect(savedState()).toEqual({})
  })

  it('keeps a restored state when only the threshold changed', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    settings = settingsWith([alertItem({ trigger: { type: 'batteryBelow', threshold: 20 } })])
    await restart({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
    expect(savedState().battery.active).toBe(true)
  })

  it('holds a restored active alert while the gateway is disconnected', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    await restart({ soc: 10, connected: false })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    const { state } = await import('../state.js')
    expect(events()).toEqual(['raised'])
    expect(state.alerts.map(({ id }) => id)).toEqual(['battery'])
  })

  it('logs a persist error once per distinct message', async () => {
    const blocker = join(dataDir, 'blocker')
    writeFileSync(blocker, '')
    process.env.DATA_DIR = join(blocker, 'data')
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    const failures = logged().split('\n').filter((line) => line.includes('could not save'))
    expect(events()).toEqual(['raised'])
    expect(failures).toHaveLength(1)
  })
})

describe('disabling or deleting an active alert', () => {
  it('sends nothing when an active alert is disabled and clears its saved state', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    settings = settingsWith([alertItem({ enabled: false })])
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
    expect(savedState().battery?.active ?? false).toBe(false)
  })

  it('sends nothing when an active alert is deleted and clears its saved state', async () => {
    await boot({ soc: 10 })
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    settings = settingsWith([])
    await vi.advanceTimersByTimeAsync(ARM_WINDOW_MS)
    expect(events()).toEqual(['raised'])
    expect(savedState()).toEqual({})
  })
})

const boot = async ({ soc, connected = true }) => {
  vi.resetModules()
  vi.doMock('../settings.js', () => ({ getSettings: () => settings }))
  vi.doMock('../history.js', () => ({ getRecentHistory: () => [] }))
  const { state } = await import('../state.js')
  state.connected = connected
  state.batterySoc = soc
  state.lastUpdated = new Date().toISOString()
  const { startAlerts } = await import('../alerts.js')
  startAlerts()
}

const restart = async ({ soc, connected = true }) => {
  vi.clearAllTimers()
  await boot({ soc, connected })
}

const events = () =>
  fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).event)

const savedState = () => JSON.parse(readFileSync(join(dataDir, 'alerts-state.json'), 'utf8'))

const logged = () => console.log.mock.calls.map(([message]) => message).join('\n')

const alertItem = ({ enabled = true, trigger = BATTERY_LOW } = {}) => ({
  id: 'battery',
  name: 'Battery low',
  enabled,
  trigger,
  notify: { raised: true, cleared: true },
  channels: {
    webhook: { enabled: true, url: 'http://hook.invalid/x' },
    homekit: { enabled: false }
  }
})

const settingsWith = (items) => ({
  alerts: { items },
  battery: { capacityKwh: 10, reserveSoc: 0 },
  tariff: {
    importRate: 0, exportRate: 0, importWindows: [], exportWindows: [], supplyChargePerDay: 0,
    zeroDrawCredit: { enabled: false }, superExportCredit: { enabled: false }
  },
  weather: { enabled: false }
})

const BATTERY_LOW = { type: 'batteryBelow', threshold: 15 }

const TICK_MS = 15000

const ARM_MS = 120000

const ARM_WINDOW_MS = 300000
