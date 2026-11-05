import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stepRule } from '../alerts.js'
import { getTrigger } from '../triggers.js'

const liveCtx = {
  connected: true,
  dataAgeMs: 0,
  batterySoc: 50,
  batterySoh: 50,
  pvPower: 9000,
  gridPower: 9000,
  batteryPower: 0,
  loadPower: 9000,
  outdoorTemp: 20,
  costPerHour: 50,
  estimate: { status: 'ready', direction: 'discharge', minutesRemaining: 10 }
}

const offlineCtx = { ...liveCtx, connected: false }

const GATEWAY_TRIGGERS = [
  ['gridImportAbove', { threshold: 5000 }],
  ['gridExportAbove', { threshold: 5000 }, { gridPower: -9000 }],
  ['solarAbove', { threshold: 5000 }],
  ['loadAbove', { threshold: 5000 }],
  ['costRateAbove', { threshold: 1 }],
  ['batteryHealthBelow', { threshold: 80 }],
  ['batteryEmptyWithin', { threshold: 60 }]
]

describe('gateway-derived triggers while disconnected', () => {
  for (const [type, params, overrides = {}] of GATEWAY_TRIGGERS) {
    it(`${type} reports no signal while the gateway is disconnected`, () => {
      const trigger = getTrigger(type)
      expect(trigger.isBad({ ctx: { ...liveCtx, ...overrides }, params, active: false })).toBe(true)
      expect(trigger.isBad({ ctx: { ...offlineCtx, ...overrides }, params, active: false })).toBeNull()
    })
  }
})

describe('stepRule with no signal', () => {
  const active = { active: true, since: 0, candidateAt: null }
  const idle = { active: false, since: null, candidateAt: null }
  const step = (prev, now) => stepRule({ prev, bad: null, armMs: 1000, clearMs: 1000, now })

  it('holds an active alert through an outage longer than the clear delay', () => {
    const first = step(active, 1000)
    const later = step(first.next, 999999)
    expect(first.edge).toBeNull()
    expect(later.edge).toBeNull()
    expect(later.next.active).toBe(true)
  })

  it('never raises an idle alert on a missing signal', () => {
    const first = step(idle, 1000)
    const later = step(first.next, 999999)
    expect(later.edge).toBeNull()
    expect(later.next.active).toBe(false)
  })
})

describe('webhook retry', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock('../settings.js')
    vi.doUnmock('../history.js')
    vi.restoreAllMocks()
    rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  })

  const raiseOnce = async (fetchMock) => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'sigen-alerts-outage-'))
    vi.resetModules()
    vi.doMock('../settings.js', () => ({ getSettings: () => SETTINGS }))
    vi.doMock('../history.js', () => ({ getHistoryAll: () => [] }))
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)
    const { state } = await import('../state.js')
    state.connected = false
    const { startAlerts } = await import('../alerts.js')
    startAlerts()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }

  it('retries once after a 5xx response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, status: 204 })
    await raiseOnce(fetchMock)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries once after a network error', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValue(new TypeError('fetch failed'))
    await raiseOnce(fetchMock)
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await raiseOnce(fetchMock)
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

const SETTINGS = {
  alerts: {
    items: [{
      id: 'gw',
      name: 'Gateway offline',
      enabled: true,
      trigger: { type: 'gatewayOffline', afterMinutes: 1 },
      notify: { raised: true, cleared: false },
      channels: { webhook: { enabled: true, url: 'http://hook.invalid/x' }, homekit: { enabled: false } }
    }]
  },
  battery: { capacityKwh: 10, reserveSoc: 0 },
  tariff: {
    importRate: 0, exportRate: 0, importWindows: [], exportWindows: [], supplyChargePerDay: 0,
    zeroDrawCredit: { enabled: false }, superExportCredit: { enabled: false }
  },
  weather: { enabled: false }
}

describe('held alerts with no signal', () => {
  it('describes a disconnected battery alert as having no reading', () => {
    const trigger = getTrigger('batteryBelow')
    const params = { threshold: 15 }
    expect(trigger.describe({ ctx: offlineCtx, params })).toBe('Battery low: no current reading')
    expect(trigger.reading({ ctx: offlineCtx, params }).value).toBeNull()
  })

  it('reports a null value for a disconnected grid alert instead of the frozen reading', () => {
    const trigger = getTrigger('gridImportAbove')
    const params = { threshold: 5000 }
    expect(trigger.describe({ ctx: offlineCtx, params })).toBe('High grid import: no current reading')
    expect(trigger.reading({ ctx: offlineCtx, params }).value).toBeNull()
  })

  it('holds state when a connected gateway reports a missing register', () => {
    const ctx = { ...liveCtx, batterySoh: null }
    expect(getTrigger('batteryHealthBelow').isBad({ ctx, params: { threshold: 80 }, active: true })).toBeNull()
  })

  it('still clears a battery-emptying alert once the battery stops discharging', () => {
    const ctx = { ...liveCtx, estimate: { status: 'ready', direction: 'charge', minutesRemaining: 30 } }
    expect(getTrigger('batteryEmptyWithin').isBad({ ctx, params: { threshold: 60 }, active: true })).toBe(false)
  })
})

describe('stale weather reading', () => {
  it('holds an active hot-weather alert past the clear delay while the reading is null', () => {
    const trigger = getTrigger('outdoorTempAbove')
    const params = { threshold: 35 }
    const ctx = { ...liveCtx, outdoorTemp: null }
    let prev = { active: true, since: 0, candidateAt: null }
    const step = (now) => {
      const bad = trigger.isBad({ ctx, params, active: prev.active })
      const result = stepRule({ prev, bad, armMs: trigger.armMs(params), clearMs: trigger.clearMs(params), now })
      prev = result.next
      return result.edge
    }
    expect(step(1000)).toBeNull()
    expect(step(1000 + trigger.clearMs(params))).toBeNull()
    expect(step(1000 + trigger.clearMs(params) * 10)).toBeNull()
    expect(prev.active).toBe(true)
  })
})

describe('battery-emptying signal', () => {
  const isBad = (estimate) =>
    getTrigger('batteryEmptyWithin').isBad({ ctx: { ...liveCtx, estimate }, params: { threshold: 60 }, active: true })

  it('clears when the battery goes idle and holds while the estimate warms up', () => {
    expect(isBad({ status: 'idle' })).toBe(false)
    expect(isBad({ status: 'warming' })).toBeNull()
  })
})
