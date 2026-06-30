process.env.TZ = 'UTC'

import { describe, expect, it } from 'vitest'
import { activeRate, batteryEstimate, costPerHour, dailyCost, netPerHour, socPercent } from '../derive.js'

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

describe('socPercent', () => {
  it('rounds normally away from the rails', () => {
    expect(socPercent(50.4)).toBe(50)
    expect(socPercent(15.6)).toBe(16)
  })

  it('never reads full unless genuinely at 100', () => {
    expect(socPercent(99.7)).toBe(99)
    expect(socPercent(99.5)).toBe(99)
    expect(socPercent(100)).toBe(100)
  })

  it('never reads empty unless genuinely at 0', () => {
    expect(socPercent(0.4)).toBe(1)
    expect(socPercent(0)).toBe(0)
  })

  it('clamps out-of-range and missing values', () => {
    expect(socPercent(120)).toBe(100)
    expect(socPercent(-5)).toBe(0)
    expect(socPercent(null)).toBe(0)
    expect(socPercent(undefined)).toBe(0)
  })
})

describe('costPerHour', () => {
  it('charges for grid import', () => {
    expect(costPerHour({ gridWatts: 2000, importRate: 0.5, exportRate: 0.1 })).toBe(1)
  })

  it('credits grid export', () => {
    expect(costPerHour({ gridWatts: -2000, importRate: 0.5, exportRate: 0.1 })).toBeCloseTo(-0.2)
  })

  it('ignores grid jitter below the deadband', () => {
    expect(costPerHour({ gridWatts: 10, importRate: 0.5, exportRate: 0.1 })).toBe(0)
  })
})

const GLOBIRD = {
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

describe('netPerHour', () => {
  it('returns a positive credit rate while exporting in an export window', () => {
    expect(netPerHour({ tariff: GLOBIRD, gridWatts: -2000, now: new Date(at(17)) })).toBeCloseTo(0.1)
  })

  it('returns a negative cost rate while importing', () => {
    expect(netPerHour({ tariff: GLOBIRD, gridWatts: 2000, now: new Date(at(17)) })).toBeCloseTo(-1.144)
  })
})

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
    expect(cost.supply).toBe(2.65)
    expect(cost.net).toBeCloseTo(0.15 + 0.3 - 0.286 - 2.65)
  })

  it('awards the zero-draw credit when no import lands in its window', () => {
    const cost = dailyCost({ samples: segment(16, 16.5, 1000), tariff: GLOBIRD, now: new Date(at(17)) })
    expect(cost.zeroDrawMet).toBe(true)
    expect(cost.zeroDrawCredit).toBe(1)
  })
})

const ramp = ({ from, to, batteryPower }) => {
  const out = []
  const steps = 15
  for (let index = 0; index <= steps; index++) {
    out.push({
      t: DAY + index * 60000,
      batteryPower,
      batterySoc: from + ((to - from) * index) / steps
    })
  }
  return out
}

const chargeRun = ({ soc, watts }) => {
  const out = []
  const steps = 15
  for (let index = 0; index <= steps; index++) {
    out.push({
      t: DAY + index * 60000,
      batteryPower: typeof watts === 'function' ? watts(index) : watts,
      batterySoc: soc
    })
  }
  return out
}

describe('batteryEstimate', () => {
  it('reports idle when the battery is resting', () => {
    expect(batteryEstimate(ramp({ from: 50, to: 50, batteryPower: 0 }))).toEqual({ status: 'idle' })
  })

  it('warms up on too few samples to project', () => {
    const samples = [{ t: DAY, batteryPower: 2000, batterySoc: 50 }]
    expect(batteryEstimate(samples)).toEqual({ status: 'warming' })
  })

  it('projects time to full while charging', () => {
    const estimate = batteryEstimate(ramp({ from: 50, to: 60, batteryPower: 2000 }), { capacityKwh: 10 })
    expect(estimate.status).toBe('ready')
    expect(estimate.direction).toBe('charge')
    expect(estimate.target).toBe('full')
    expect(estimate.minutesRemaining).toBeGreaterThan(0)
    expect(estimate.energyToGoKwh).toBeCloseTo(4)
    expect(Date.parse(estimate.etaIso)).toBeGreaterThan(DAY)
  })

  it('projects time to the reserve floor while discharging', () => {
    const estimate = batteryEstimate(ramp({ from: 60, to: 50, batteryPower: -2000 }), { reserveSoc: 10 })
    expect(estimate.status).toBe('ready')
    expect(estimate.direction).toBe('discharge')
    expect(estimate.target).toBe('reserve')
  })

  it('projects from the charge power even before SoC has visibly moved', () => {
    const estimate = batteryEstimate(chargeRun({ soc: 50, watts: 3000 }), { capacityKwh: 10 })
    expect(estimate.status).toBe('ready')
    expect(estimate.minutesRemaining).toBe(100)
  })

  it('reacts to a recent power step rather than the stale average', () => {
    const flat = batteryEstimate(chargeRun({ soc: 50, watts: 500 }), { capacityKwh: 10 })
    const stepped = batteryEstimate(
      chargeRun({ soc: 50, watts: (index) => (index >= 13 ? 4000 : 500) }),
      { capacityKwh: 10 }
    )
    expect(stepped.minutesRemaining).toBeLessThan(flat.minutesRemaining)
  })
})
