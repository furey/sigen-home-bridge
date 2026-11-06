import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'sigen-history-recent-'))

process.env.DATA_DIR = dataDir
process.env.HISTORY_RETENTION_DAYS = '1'

const { loadSettings } = await import('../settings.js')
const { startHistory, recordSample, getRecentHistory } = await import('../history.js')

beforeAll(() => {
  loadSettings()
  startHistory()
})

afterAll(() => rmSync(dataDir, { recursive: true, force: true }))

const HOUR_MS = 3600000

const reading = (t, loadPower) => ({
  lastUpdated: new Date(t).toISOString(),
  pvPower: 1,
  gridPower: 2,
  batteryPower: 3,
  batterySoc: 60,
  loadPower,
  smartPortPower: null,
  outdoorTemp: null
})

describe('recent history with one day of retention', () => {
  it('holds a full 25-hour daylight saving day in memory', () => {
    const midnight = Date.parse('2034-04-01T13:00:00.000Z')
    recordSample(reading(midnight, 111))
    recordSample(reading(midnight + 25 * HOUR_MS, 222))
    expect(getRecentHistory().map((sample) => sample.loadPower)).toEqual([111, 222])
  })
})
