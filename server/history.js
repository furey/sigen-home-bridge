import { existsSync, readFileSync, renameSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'
import { getSettings, onSettingsChange } from './settings.js'

export const startHistory = () => {
  openDatabase()
  importLegacySnapshot()
  samples = trim(loadStored())
  onSettingsChange(onRetentionChange)
  setInterval(pruneDatabase, MAINTENANCE_INTERVAL_MS)
  registerShutdown()
}

export const recordSample = (source) => {
  const sample = toSample(source)
  samples.push(sample)
  trim(samples)
  persist(sample)
}

export const getHistory = ({ limit = LIVE_LIMIT, order = 'asc', since = null, until = null, every = null } = {}) => {
  const windowed = since == null && until == null
    ? samples
    : samples.filter((sample) => withinWindow(sample.t, since, until))
  const shaped = every
    ? downsampleHistory(windowed, bucketFloor(every, windowed))
    : windowed.slice(-clampLimit(limit))
  return order === 'desc' ? [...shaped].reverse() : shaped
}

export const getHistoryAll = () => samples

export const historyStats = () => ({
  count: samples.length,
  firstT: samples.length ? samples[0].t : null,
  lastT: samples.length ? samples.at(-1).t : null
})

export const nearestSample = ({ before = null, after = null } = {}) => {
  if (before != null) {
    const index = firstAtOrAfter(before) - 1
    return index >= 0 ? samples[index] : null
  }
  if (after != null) {
    const index = firstAfter(after)
    return index < samples.length ? samples[index] : null
  }
  return null
}

export const downsampleHistory = (rows, everyMs) => {
  if (!Number.isFinite(everyMs) || everyMs <= 0) return rows
  const latestPerBucket = new Map()
  for (const row of rows) latestPerBucket.set(Math.floor(row.t / everyMs), row)
  return [...latestPerBucket.values()]
}

export const historyToCsv = (rows) =>
  `${[CSV_HEADER, ...rows.map(toCsvRow)].map((cells) => cells.join(',')).join('\n')}\n`

export const legacyImportRows = (parsed) =>
  Array.isArray(parsed) ? parsed.filter((row) => Number.isFinite(row?.t)) : []

export const MAX_SAMPLES = 250000

export const LIVE_LIMIT = 20000

const FIELDS = ['pvPower', 'gridPower', 'batteryPower', 'batterySoc', 'loadPower', 'outdoorTemp']

const CSV_HEADER = ['time', ...FIELDS]

const toCsvRow = (row) => [new Date(row.t).toISOString(), ...FIELDS.map((field) => csvCell(row[field]))]

const csvCell = (value) => (value === null || value === undefined ? '' : value)

const clampLimit = (limit) => {
  const count = Math.floor(Number(limit))
  return Number.isFinite(count) && count > 0 ? Math.min(count, LIVE_LIMIT) : LIVE_LIMIT
}

const bucketFloor = (every, rows) => {
  if (rows.length < 2) return every
  return Math.max(every, (rows.at(-1).t - rows[0].t) / LIVE_LIMIT)
}

const withinWindow = (t, since, until) =>
  (since == null || t >= since) && (until == null || t <= until)

const firstAtOrAfter = (t) => {
  let low = 0
  let high = samples.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (samples[mid].t < t) low = mid + 1
    else high = mid
  }
  return low
}

const firstAfter = (t) => {
  let low = 0
  let high = samples.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (samples[mid].t <= t) low = mid + 1
    else high = mid
  }
  return low
}

const toSample = ({ lastUpdated, pvPower, gridPower, batteryPower, batterySoc, loadPower, outdoorTemp }) => ({
  t: lastUpdated ? Date.parse(lastUpdated) : Date.now(),
  pvPower,
  gridPower,
  batteryPower,
  batterySoc,
  loadPower,
  outdoorTemp: outdoorTemp ?? null
})

const trim = (list) => {
  dropExpired(list)
  capToCeiling(list)
  return list
}

const dropExpired = (list) => {
  if (!list.length) return
  const cutoff = list.at(-1).t - retentionMs()
  let stale = 0
  while (stale < list.length && list[stale].t < cutoff) stale += 1
  if (stale > 0) list.splice(0, stale)
}

const capToCeiling = (list) => {
  if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES)
}

const retentionMs = () => getSettings().history.retentionDays * DAY_MS

const onRetentionChange = (changed) => {
  if (!changed.includes('history')) return
  trim(samples)
  pruneDatabase()
}

const openDatabase = () => {
  try {
    db = new DatabaseSync(config.paths.historyDb)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec(CREATE_TABLE)
    insertStatement = db.prepare(INSERT_ROW)
  } catch (error) {
    db = null
    insertStatement = null
    log(`database unavailable; keeping history in memory only: ${error.message}`)
  }
}

const importLegacySnapshot = () => {
  if (!db || rowCount() > 0 || !existsSync(config.paths.history)) return
  const rows = parseLegacySnapshot()
  if (!rows.length) return
  insertMany(rows)
  if (rowCount() === 0) return log('legacy history.json import did not persist; leaving it in place')
  renameSync(config.paths.history, `${config.paths.history}.imported`)
  log(`imported ${rowCount()} samples from history.json`)
}

const parseLegacySnapshot = () => {
  try {
    return legacyImportRows(JSON.parse(readFileSync(config.paths.history, 'utf8')))
  } catch {
    return []
  }
}

const loadStored = () => {
  if (!db) return []
  const rows = db.prepare(`
    SELECT t, pvPower, gridPower, batteryPower, batterySoc, loadPower, outdoorTemp
    FROM samples ORDER BY t
  `).all()
  log(`restored ${rows.length} samples`)
  return rows
}

const persist = (sample) => {
  if (!insertStatement) return
  try {
    insertStatement.run(...rowValues(sample))
  } catch (error) {
    log(`insert failed: ${error.message}`)
  }
}

const insertMany = (rows) => {
  db.exec('BEGIN')
  try {
    for (const row of rows) insertStatement.run(...rowValues(row))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    log(`import failed: ${error.message}`)
  }
}

const rowValues = ({ t, pvPower, gridPower, batteryPower, batterySoc, loadPower, outdoorTemp }) =>
  [t, pvPower ?? null, gridPower ?? null, batteryPower ?? null, batterySoc ?? null, loadPower ?? null, outdoorTemp ?? null]

const rowCount = () => (db ? db.prepare('SELECT COUNT(*) AS count FROM samples').get().count : 0)

const pruneDatabase = () => {
  if (!db || !samples.length) return
  try {
    db.prepare('DELETE FROM samples WHERE t < ?').run(samples.at(-1).t - retentionMs())
    db.prepare(DELETE_BEYOND_CEILING).run(MAX_SAMPLES)
  } catch (error) {
    log(`prune failed: ${error.message}`)
  }
}

const registerShutdown = () => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      db?.close()
      process.exit(0)
    })
  }
}

const log = (message) => console.log(`[history] ${message}`)

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS samples (
  t INTEGER PRIMARY KEY,
  pvPower REAL,
  gridPower REAL,
  batteryPower REAL,
  batterySoc REAL,
  loadPower REAL,
  outdoorTemp REAL
)`

const INSERT_ROW = `INSERT OR REPLACE INTO samples
  (t, pvPower, gridPower, batteryPower, batterySoc, loadPower, outdoorTemp)
  VALUES (?, ?, ?, ?, ?, ?, ?)`

const DELETE_BEYOND_CEILING =
  'DELETE FROM samples WHERE t < (SELECT MIN(t) FROM (SELECT t FROM samples ORDER BY t DESC LIMIT ?))'

const MAINTENANCE_INTERVAL_MS = 300000

const DAY_MS = 86400000

let db = null

let insertStatement = null

let samples = []
