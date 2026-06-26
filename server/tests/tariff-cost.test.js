process.env.TZ = 'UTC'

import { describe, expect, it } from 'vitest'
import { activeRate, costPerHour, dailyCost, formatMoney } from '../../ui/src/lib/tariff.js'

const PEAK = { start: '16:00', end: '23:00', rate: 0.572 }
const OFF_PEAK = { start: '11:00', end: '14:00', rate: 0 }
const OVERNIGHT = { start: '23:00', end: '04:00', rate: 0.1 }

describe('activeRate', () => {
  it('matches a daytime window', () => {
    expect(activeRate({ windows: [PEAK, OFF_PEAK], defaultRate: 0.462, minutes: 17 * 60 })).toBe(0.572)
  })

  it('falls back to the default outside every window', () => {
    expect(activeRate({ windows: [PEAK, OFF_PEAK], defaultRate: 0.462, minutes: 9 * 60 })).toBe(0.462)
  })

  it('matches a window that wraps past midnight', () => {
    expect(activeRate({ windows: [OVERNIGHT], defaultRate: 0.3, minutes: 2 * 60 })).toBe(0.1)
    expect(activeRate({ windows: [OVERNIGHT], defaultRate: 0.3, minutes: 12 * 60 })).toBe(0.3)
  })
})

describe('costPerHour', () => {
  it('charges for grid import', () => {
    expect(costPerHour({ gridWatts: 2000, importRate: 0.5, exportRate: 0.1 })).toBe(1)
  })

  it('credits grid export', () => {
    expect(costPerHour({ gridWatts: -2000, importRate: 0.5, exportRate: 0.1 })).toBeCloseTo(-0.2)
  })

  it('is zero when balanced', () => {
    expect(costPerHour({ gridWatts: 0, importRate: 0.5, exportRate: 0.1 })).toBe(0)
  })

  it('ignores grid jitter below the deadband', () => {
    expect(costPerHour({ gridWatts: 10, importRate: 0.5, exportRate: 0.1 })).toBe(0)
    expect(costPerHour({ gridWatts: -12, importRate: 0.5, exportRate: 0.1 })).toBe(0)
  })
})

const GLOBIRD = {
  enabled: true,
  currency: 'AUD',
  importRate: 0.462,
  exportRate: 0,
  importWindows: [PEAK, OFF_PEAK],
  exportWindows: [{ start: '16:00', end: '23:00', rate: 0.05 }],
  supplyChargePerDay: 2.65,
  zeroDrawCredit: { enabled: true, start: '18:00', end: '21:00', perDay: 1 },
  superExportCredit: { enabled: true, start: '16:00', end: '23:00', capKwh: 15, rate: 0.1 }
}

const DAY = Date.UTC(2026, 5, 16)
const at = (hour, minute = 0) => DAY + (hour * 60 + minute) * 60000
const STEP_MS = 300000

const segment = (startHour, endHour, gridPower) => {
  const out = []
  for (let t = at(startHour); t <= at(endHour); t += STEP_MS) out.push({ t, gridPower })
  return out
}

describe('dailyCost', () => {
  it('breaks down import, feed-in, and credits for the local day', () => {
    const samples = [
      { t: at(16) - 86400000, gridPower: 999999 },
      ...segment(16, 17, -3000),
      ...segment(18, 18.5, 1000)
    ]
    const cost = dailyCost({ samples, tariff: GLOBIRD, now: new Date(at(19)) })
    expect(cost.feedIn).toBeCloseTo(0.15)
    expect(cost.superExportCredit).toBeCloseTo(0.3)
    expect(cost.importCost).toBeCloseTo(0.286)
    expect(cost.zeroDrawMet).toBe(false)
    expect(cost.zeroDrawCredit).toBe(0)
    expect(cost.supply).toBe(2.65)
    expect(cost.net).toBeCloseTo(0.15 + 0.3 - 0.286 - 2.65)
    expect(cost.currency).toBe('AUD')
  })

  it('awards the zero-draw credit when no import lands in its window', () => {
    const cost = dailyCost({ samples: segment(16, 16.5, 1000), tariff: GLOBIRD, now: new Date(at(17)) })
    expect(cost.zeroDrawMet).toBe(true)
    expect(cost.zeroDrawCredit).toBe(1)
  })

  it('caps the super-export credit at the configured kWh', () => {
    const cost = dailyCost({ samples: segment(16, 20, -20000), tariff: GLOBIRD, now: new Date(at(21)) })
    expect(cost.superExportCredit).toBeCloseTo(1.5)
  })
})

describe('formatMoney', () => {
  it('delegates to Intl currency formatting for a valid currency', () => {
    expect(formatMoney({ amount: 1.5, currency: 'USD' })).toBe(
      new Intl.NumberFormat(undefined, {
        style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol'
      }).format(1.5))
  })

  it('falls back to two decimals for a malformed currency', () => {
    expect(formatMoney({ amount: 1.5, currency: 'US' })).toBe('1.50')
  })

  it('renders a rounding-zero without a negative sign', () => {
    expect(formatMoney({ amount: -0.001, currency: 'USD' }).includes('-')).toBe(false)
  })
})
