import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'sigen-history-energy-'))

process.env.DATA_DIR = dataDir
process.env.HISTORY_RETENTION_DAYS = '7'

const { loadSettings } = await import('../settings.js')
const { startHistory, recordSample, energyByPeriods, parseEnergyBounds } = await import('../history.js')

const HOUR_MS = 3600000
const DAY_MS = 24 * HOUR_MS
const STEP_MS = 60000
const DAY_ONE = Date.parse('2034-03-01T00:00:00.000Z')

const reading = (t, overrides = {}) => ({
  lastUpdated: new Date(t).toISOString(),
  pvPower: 0,
  gridPower: 0,
  batteryPower: 0,
  batterySoc: 50,
  loadPower: 0,
  smartPortPower: null,
  outdoorTemp: null,
  ...overrides
})

const recordEvery = ({ from, to, overrides }) => {
  for (let t = from; t <= to; t += STEP_MS) recordSample(reading(t, overrides(t)))
}

beforeAll(() => {
  loadSettings()
  startHistory()
  recordEvery({
    from: DAY_ONE + 10 * HOUR_MS,
    to: DAY_ONE + 12 * HOUR_MS,
    overrides: (t) => ({ pvPower: 1000, gridPower: -500, batterySoc: 50 + (t - DAY_ONE - 10 * HOUR_MS) / HOUR_MS })
  })
  recordEvery({
    from: DAY_ONE + DAY_MS + 18 * HOUR_MS,
    to: DAY_ONE + DAY_MS + 19 * HOUR_MS,
    overrides: () => ({ loadPower: 2000, gridPower: 2000 })
  })
  recordSample(reading(DAY_ONE + DAY_MS + 21 * HOUR_MS, { loadPower: 2000, gridPower: 2000 }))
})

afterAll(() => rmSync(dataDir, { recursive: true, force: true }))

const days = (count) => Array.from({ length: count + 1 }, (_, index) => DAY_ONE + index * DAY_MS)

describe('history energy by period', () => {
  it('adds up each day separately, splitting flows into positive and negative kWh', () => {
    const [first, second] = energyByPeriods(days(2))
    expect(first.energy.pvPower).toEqual({ positive: 2, negative: 0 })
    expect(first.energy.gridPower).toEqual({ positive: 0, negative: -1 })
    expect(second.energy.loadPower).toEqual({ positive: 2, negative: 0 })
    expect(second.energy.gridPower).toEqual({ positive: 2, negative: 0 })
    expect(second.energy.pvPower).toEqual({ positive: 0, negative: 0 })
  })

  it('skips a gap longer than fifteen minutes', () => {
    const [, second] = energyByPeriods(days(2))
    expect(second.energy.loadPower.positive).toBe(2)
  })

  it('reports the first and last battery charge of each day', () => {
    const [first] = energyByPeriods(days(1))
    expect(first.socStart).toBe(50)
    expect(first.socEnd).toBe(52)
  })

  it('returns empty days before and after the readings', () => {
    const periods = energyByPeriods([DAY_ONE - DAY_MS, ...days(3)])
    expect(periods).toHaveLength(4)
    expect(periods[0].energy.pvPower).toEqual({ positive: 0, negative: 0 })
    expect(periods[3].socStart).toBeNull()
  })

  it('recounts a finished day when a late reading arrives for it', () => {
    const before = energyByPeriods(days(2))[1].energy.loadPower.positive
    recordSample(reading(DAY_ONE + DAY_MS + 20 * HOUR_MS, { loadPower: 2000, gridPower: 2000 }))
    recordSample(reading(DAY_ONE + DAY_MS + 20 * HOUR_MS + 10 * 60000, { loadPower: 2000, gridPower: 2000 }))
    expect(energyByPeriods(days(2))[1].energy.loadPower.positive).toBeGreaterThan(before)
  })

  it('leaves out readings older than the retention window', () => {
    recordSample(reading(DAY_ONE + 8 * DAY_MS + 12 * HOUR_MS, { loadPower: 1 }))
    const [first, second] = energyByPeriods(days(2))
    expect(first.energy.pvPower.positive).toBe(0)
    expect(second.energy.loadPower.positive).toBeGreaterThan(0)
  })
})

describe('history energy bounds', () => {
  it('accepts ascending timestamps', () => {
    expect(parseEnergyBounds('1,2,3')).toEqual([1, 2, 3])
  })

  it('rejects too few, unordered, non-numeric, or too many bounds', () => {
    expect(parseEnergyBounds('1')).toBeNull()
    expect(parseEnergyBounds('2,1')).toBeNull()
    expect(parseEnergyBounds('1,x')).toBeNull()
    expect(parseEnergyBounds(undefined)).toBeNull()
    expect(parseEnergyBounds(Array.from({ length: 34 }, (_, index) => index + 1).join(','))).toBeNull()
  })
})
