import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'sigen-history-memory-only-'))

mkdirSync(join(dataDir, 'history.db'))

process.env.DATA_DIR = dataDir
process.env.HISTORY_RETENTION_DAYS = '7'

const {
  startHistory, recordSample, getHistory, historyStats, nearestSample, exportRows,
  MEMORY_ONLY_MAX_SAMPLES
} = await import('../history.js')

const base = Date.parse('2026-06-11T00:00:00.000Z')

const reading = (index) => ({
  lastUpdated: new Date(base + index).toISOString(),
  pvPower: index,
  gridPower: 0,
  batteryPower: 0,
  batterySoc: 50,
  loadPower: 1,
  smartPortPower: null,
  outdoorTemp: null
})

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  startHistory()
  for (let index = 0; index < MEMORY_ONLY_MAX_SAMPLES + 5; index += 1) recordSample(reading(index))
}, 60000)

afterAll(() => {
  vi.restoreAllMocks()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('history without a database file', () => {
  it('caps memory-only history at MEMORY_ONLY_MAX_SAMPLES, dropping the oldest', () => {
    expect(historyStats()).toEqual({
      count: MEMORY_ONLY_MAX_SAMPLES, firstT: base + 5, lastT: base + MEMORY_ONLY_MAX_SAMPLES + 4
    })
  })

  it('serves reads from the in-memory store', () => {
    const newest = MEMORY_ONLY_MAX_SAMPLES + 4
    expect(getHistory({ limit: 2 }).map((row) => row.pvPower)).toEqual([newest - 1, newest])
    expect(nearestSample({ after: base }).pvPower).toBe(5)
    expect([...exportRows({ everyMs: 60000 })]).toHaveLength(Math.ceil((newest + 1) / 60000))
  })

  it('widens a sub-second export bucket to one second', () => {
    const expected = Math.ceil((MEMORY_ONLY_MAX_SAMPLES + 5) / 1000)
    expect([...exportRows({ everyMs: 1 })]).toHaveLength(expected)
  })

  it('widens a sub-second history bucket to one second', () => {
    const rows = getHistory({ since: base, until: base + 9999, every: 0.001 })
    const lastPerSecond = Array.from({ length: 10 }, (_, second) => second * 1000 + 999)
    expect(rows.map((row) => row.pvPower)).toEqual(lastPerSecond)
  })
})
