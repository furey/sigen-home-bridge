import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync, StatementSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'sigen-history-retention-'))

process.env.DATA_DIR = dataDir
process.env.HISTORY_RETENTION_DAYS = '21'

const DAY_MS = 86400000
const STEP_MS = 5000
const ROWS = (21 * DAY_MS) / STEP_MS
const NEWEST = Date.parse('2026-10-01T00:00:00.000Z')
const OLDEST = NEWEST - (ROWS - 1) * STEP_MS
const OLD_CAP = 250000

const seedLegacyDatabase = () => {
  const db = new DatabaseSync(join(dataDir, 'history.db'))
  db.exec(`CREATE TABLE samples (
    t INTEGER PRIMARY KEY, pvPower REAL, gridPower REAL, batteryPower REAL,
    batterySoc REAL, loadPower REAL, outdoorTemp REAL
  )`)
  const insert = db.prepare('INSERT INTO samples VALUES (?, ?, ?, ?, ?, ?, ?)')
  db.exec('BEGIN')
  for (let index = 0; index < ROWS; index += 1) {
    const outdoorTemp = index % 2 ? 18.25 : null
    const t = OLDEST + index * STEP_MS
    insert.run(t, index % 900, -index % 700, index % 7, 50.5, 1000, outdoorTemp)
  }
  db.exec('COMMIT')
  db.close()
}

const storedCount = () => {
  const db = new DatabaseSync(join(dataDir, 'history.db'))
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM samples').get()
  db.close()
  return count
}

const storedFirstT = () => {
  const db = new DatabaseSync(join(dataDir, 'history.db'))
  const { t } = db.prepare('SELECT MIN(t) AS t FROM samples').get()
  db.close()
  return t
}

seedLegacyDatabase()

const { loadSettings, updateSettings } = await import('../settings.js')
const {
  startHistory, recordSample, getHistory, historyStats, nearestSample, exportRows,
  historyExportChunks
} = await import('../history.js')

beforeAll(() => {
  loadSettings()
  startHistory()
}, 30000)

afterAll(() => rmSync(dataDir, { recursive: true, force: true }))

const reading = (t) => ({
  lastUpdated: new Date(t).toISOString(),
  pvPower: 1,
  gridPower: 2,
  batteryPower: 3,
  batterySoc: 60,
  loadPower: 4,
  smartPortPower: null,
  outdoorTemp: null
})

describe('history retention beyond the old sample ceiling', () => {
  it('keeps every row of an existing 21-day database at a 5 s poll', () => {
    const stats = historyStats()
    expect(stats.count).toBeGreaterThan(OLD_CAP)
    expect(stats.count).toBe(ROWS)
    expect(stats.firstT).toBe(OLDEST)
    expect(stats.lastT).toBe(NEWEST)
  })

  it('adds the smart port column to an existing database without losing rows', () => {
    const [oldest] = getHistory({ since: OLDEST, limit: 1, order: 'asc', until: OLDEST })
    expect(oldest).toEqual({
      t: OLDEST, pvPower: 0, gridPower: 0, batteryPower: 0, batterySoc: 50.5, loadPower: 1000,
      smartPortPower: null, outdoorTemp: null
    })
  })

  it('reads raw rows older than 14.5 days', () => {
    const rows = getHistory({ since: OLDEST, until: OLDEST + 3600000 })
    expect(rows).toHaveLength(721)
    expect(rows[0].t).toBe(OLDEST)
  })

  it('finds the nearest sample at the old end of retention', () => {
    expect(nearestSample({ after: OLDEST - 1 }).t).toBe(OLDEST)
    expect(nearestSample({ before: OLDEST })).toBeNull()
  })

  it('downsamples across the whole retention window', () => {
    const rows = getHistory({ every: 3600000 })
    expect(rows[0].t).toBeLessThan(OLDEST + 3600000)
    expect(rows.at(-1).t).toBe(NEWEST)
  })

  it('keeps every row in the database through a prune', () => {
    recordSample(reading(NEWEST + STEP_MS))
    updateSettings({ history: { retentionDays: 22 } })
    expect(storedCount()).toBe(ROWS + 1)
    expect(historyStats().count).toBe(ROWS + 1)
  })

  it('still prunes rows that fall outside retention', () => {
    updateSettings({ history: { retentionDays: 20 } })
    expect(historyStats().firstT).toBe(NEWEST + STEP_MS - 20 * DAY_MS)
    expect(storedCount()).toBe(20 * DAY_MS / STEP_MS + 1)
  })
})

describe('history export rows', () => {
  it('streams every retained row in bounded database pages', () => {
    const pageSizes = []
    const all = StatementSync.prototype.all
    const spy = vi.spyOn(StatementSync.prototype, 'all').mockImplementation(function (...args) {
      const rows = all.apply(this, args)
      pageSizes.push(rows.length)
      return rows
    })
    let count = 0
    let previous = -Infinity
    let ordered = true
    for (const row of exportRows()) {
      ordered &&= row.t > previous
      previous = row.t
      count += 1
    }
    spy.mockRestore()
    expect(count).toBe(historyStats().count)
    expect(ordered).toBe(true)
    expect(pageSizes.length).toBeGreaterThan(1)
    expect(Math.max(...pageSizes)).toBeLessThanOrEqual(2000)
  }, 30000)

  it('pulls rows lazily so the first chunk needs only the first page', () => {
    const pageSizes = []
    const all = StatementSync.prototype.all
    const spy = vi.spyOn(StatementSync.prototype, 'all').mockImplementation(function (...args) {
      const rows = all.apply(this, args)
      pageSizes.push(rows.length)
      return rows
    })
    const chunks = historyExportChunks({ rows: exportRows(), format: 'csv' })
    chunks.next()
    chunks.next()
    chunks.return()
    spy.mockRestore()
    expect(pageSizes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(4000)
  })

  it('downsamples the export in bounded pages', () => {
    const rows = [...exportRows({ everyMs: 60000 })]
    const expected = Math.ceil(historyStats().count / 12)
    expect(Math.abs(rows.length - expected)).toBeLessThanOrEqual(1)
    const bucket = (row) => Math.floor(row.t / 60000)
    const ascending = rows.every((row, index) =>
      index === 0 || bucket(row) > bucket(rows[index - 1]))
    expect(ascending).toBe(true)
  }, 30000)
})

describe('history upkeep', () => {
  const statementsRun = (action) => {
    const sources = []
    const get = StatementSync.prototype.get
    const spy = vi.spyOn(StatementSync.prototype, 'get').mockImplementation(function (...args) {
      sources.push(this.sourceSQL)
      return get.apply(this, args)
    })
    action()
    spy.mockRestore()
    return sources
  }

  it('reports the count without scanning the table', () => {
    const sources = statementsRun(() => historyStats())
    expect(sources.some((source) => /COUNT/i.test(source))).toBe(false)
    expect(historyStats().count).toBe(storedCount())
  })

  it('keeps the count exact when a sample replaces one at the same time', () => {
    recordSample(reading(NEWEST + STEP_MS))
    expect(historyStats().count).toBe(storedCount())
  })

  it('prunes on insert only once the cutoff has moved a minute', () => {
    const firstT = storedFirstT()
    recordSample(reading(NEWEST + 7 * STEP_MS))
    expect(storedFirstT()).toBe(firstT)
    recordSample(reading(NEWEST + 14 * STEP_MS))
    expect(storedFirstT()).toBe(NEWEST + 14 * STEP_MS - 20 * DAY_MS)
    expect(historyStats().count).toBe(storedCount())
  })
})
