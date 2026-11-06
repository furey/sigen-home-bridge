import { existsSync, readFileSync, renameSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'
import { getSettings, onSettingsChange } from './settings.js'

export const startHistory = () => {
  openDatabase()
  importLegacySnapshot()
  storedRows = rowCount()
  pruneDatabase()
  recent = loadRecent()
  recentStart = 0
  keepRecent()
  onSettingsChange(onRetentionChange)
  registerShutdown()
}

export const recordSample = (source) => {
  const sample = toSample(source)
  recent.push(sample)
  keepRecent()
  persist(sample)
}

export const getHistory = ({ limit = LIVE_LIMIT, order = 'asc', since = null, until = null, every = null } = {}) => {
  const range = timeRange(Math.max(since ?? FULL_RANGE.from, retainedFloor()), until)
  const rows = every > 0
    ? bucketedRows({ ...range, everyMs: bucketFloor(bucketWidth(every), range) })
    : latestRows({ ...range, limit: clampLimit(limit) })
  return order === 'desc' ? rows.reverse() : rows
}

export const getRecentHistory = () => compactRecent()

export const historyStats = () => {
  if (!db) return { count: 0, firstT: null, lastT: null }
  const from = retainedFloor()
  return { count: storedRows, firstT: firstTime({ ...FULL_RANGE, from }), lastT: lastTime(FULL_RANGE) }
}

export const nearestSample = ({ before = null, after = null } = {}) => {
  if (!db) return null
  const floor = retainedFloor()
  if (before != null) return retainedOnly(statements.nearestBefore.get(before), floor)
  if (after != null) return statements.nearestAfter.get(Math.max(after, floor - 1)) ?? null
  return null
}

export const energyByPeriods = (bounds) => {
  const newest = lastTime(FULL_RANGE)
  const floor = retainedFloor()
  return bounds.slice(0, -1).map((start, index) => {
    const end = bounds[index + 1]
    const range = { from: Math.max(start, floor), before: Math.min(end, (newest ?? start) + 1) }
    if (!db || newest == null || range.from >= range.before) return emptyPeriod(start, end)
    const complete = end <= newest && end <= Date.now() && start >= floor
    if (!complete) return periodEnergy(start, end, range)
    return cachedPeriod(`${start}|${end}`, () => periodEnergy(start, end, range))
  })
}

export const parseEnergyBounds = (text) => {
  const bounds = String(text ?? '').split(',').filter(Boolean).map(Number)
  if (bounds.length < 2 || bounds.length > MAX_ENERGY_BOUNDS) return null
  const ascending = bounds.every((t, index) => Number.isFinite(t) && (index === 0 || t > bounds[index - 1]))
  return ascending ? bounds : null
}

export const exportRows = function* ({ everyMs = 0 } = {}) {
  const newest = lastTime(FULL_RANGE)
  if (newest == null) return
  const range = { from: newest - retentionMs(), before: newest + 1 }
  yield* everyMs > 0 ? bucketedPages({ ...range, everyMs: bucketWidth(everyMs) }) : rawPages(range)
}

export const downsampleHistory = (rows, everyMs) => {
  if (!Number.isFinite(everyMs) || everyMs <= 0) return rows
  const latestPerBucket = new Map()
  for (const row of rows) latestPerBucket.set(Math.floor(row.t / everyMs), row)
  return [...latestPerBucket.values()]
}

export const historyToCsv = (rows) =>
  `${[CSV_HEADER, ...rows.map(toCsvRow)].map((cells) => cells.join(',')).join('\n')}\n`

export const historyExportChunks = function* ({ rows, format, sliceSize = EXPORT_SLICE_ROWS }) {
  const encoder = EXPORT_ENCODERS[format] ?? EXPORT_ENCODERS.csv
  yield encoder.head
  let first = true
  for (const slice of slices(rows, sliceSize)) {
    yield encoder.slice(slice, first)
    first = false
  }
  if (encoder.tail) yield encoder.tail
}

export const legacyImportRows = (parsed) =>
  Array.isArray(parsed) ? parsed.filter((row) => Number.isFinite(row?.t)) : []

export const LIVE_LIMIT = 20000

export const MEMORY_ONLY_MAX_SAMPLES = 250000

const FIELDS = ['pvPower', 'gridPower', 'batteryPower', 'batterySoc', 'loadPower', 'smartPortPower', 'outdoorTemp']

const COLUMNS = ['t', ...FIELDS].join(', ')

const CSV_HEADER = ['time', ...FIELDS]

const toCsvRow = (row) => [new Date(row.t).toISOString(), ...FIELDS.map((field) => csvCell(row[field]))]

const csvCell = (value) => (value === null || value === undefined ? '' : value)

const csvLines = (slice) => slice.map((row) => `${toCsvRow(row).join(',')}\n`).join('')

const jsonItems = (slice, first) => `${first ? '' : ','}${slice.map((row) => JSON.stringify(row)).join(',')}`

const EXPORT_ENCODERS = {
  csv: { head: `${CSV_HEADER.join(',')}\n`, slice: csvLines, tail: '' },
  json: { head: '[', slice: jsonItems, tail: ']' }
}

const EXPORT_SLICE_ROWS = 2000

const slices = function* (rows, size) {
  let slice = []
  for (const row of rows) {
    slice.push(row)
    if (slice.length < size) continue
    yield slice
    slice = []
  }
  if (slice.length) yield slice
}

const rawPages = function* ({ from, before }) {
  let cursor = from
  for (;;) {
    const page = statements.rawPage.all({ from: cursor, before, limit: EXPORT_SLICE_ROWS })
    yield* page
    if (page.length < EXPORT_SLICE_ROWS) return
    cursor = page.at(-1).t + 1
  }
}

const bucketedPages = function* ({ from, before, everyMs }) {
  let first = firstTime({ from, before })
  while (first != null) {
    const pageBefore = Math.min(before, bucketStart(Math.floor(first / everyMs) + EXPORT_SLICE_ROWS, everyMs))
    yield* bucketedRows({ from: first, before: pageBefore, everyMs })
    first = firstTime({ from: pageBefore, before })
  }
}

const bucketStart = (bucket, everyMs) => {
  let start = Math.ceil(bucket * everyMs)
  while (Math.floor((start - 1) / everyMs) >= bucket) start -= 1
  while (Math.floor(start / everyMs) < bucket) start += 1
  return start
}

const bucketWidth = (everyMs) => Math.max(everyMs, MIN_BUCKET_MS)

const latestRows = ({ from, before, limit }) =>
  db ? statements.latest.all({ from, before, limit }).reverse() : []

const bucketedRows = ({ from, before, everyMs }) =>
  db ? statements.bucketed.all({ from, before, every: everyMs }) : []

const firstTime = (range) => (db ? statements.firstTime.get(range).t : null)

const lastTime = (range) => (db ? statements.lastTime.get(range).t : null)

const emptyPeriod = (start, end) => ({
  start,
  end,
  energy: Object.fromEntries(ENERGY_FIELDS.map((field) => [field, { positive: 0, negative: 0 }])),
  socStart: null,
  socEnd: null
})

const cachedPeriod = (key, compute) => {
  if (periodCache.has(key)) return periodCache.get(key)
  const period = compute()
  periodCache.set(key, period)
  if (periodCache.size > PERIOD_CACHE_LIMIT) periodCache.delete(periodCache.keys().next().value)
  return period
}

const periodEnergy = (start, end, range) => {
  const sums = statements.energy.get({ ...range, gap: ENERGY_GAP_MS })
  return {
    start,
    end,
    energy: Object.fromEntries(ENERGY_FIELDS.map((field) => [field, {
      positive: wattMsToKwh(sums[`${field}Positive`]),
      negative: wattMsToKwh(sums[`${field}Negative`])
    }])),
    socStart: statements.firstSoc.get(range)?.batterySoc ?? null,
    socEnd: statements.lastSoc.get(range)?.batterySoc ?? null
  }
}

const wattMsToKwh = (wattMs) => Math.round((wattMs ?? 0) / WATT_MS_PER_KWH * 1000) / 1000 || 0

const retainedFloor = () => {
  const newest = lastTime(FULL_RANGE)
  return newest == null ? FULL_RANGE.from : newest - retentionMs()
}

const retainedOnly = (sample, floor) => (sample && sample.t >= floor ? sample : null)

const timeRange = (since, until) => ({
  from: since ?? FULL_RANGE.from,
  before: until == null ? FULL_RANGE.before : Math.floor(until) + 1
})

const clampLimit = (limit) => {
  const count = Math.floor(Number(limit))
  return Number.isFinite(count) && count > 0 ? Math.min(count, LIVE_LIMIT) : LIVE_LIMIT
}

const bucketFloor = (every, range) => {
  const first = firstTime(range)
  const last = lastTime(range)
  if (first == null || first === last) return every
  return Math.max(every, (last - first) / LIVE_LIMIT)
}

const toSample = ({ lastUpdated, pvPower, gridPower, batteryPower, batterySoc, loadPower, smartPortPower, outdoorTemp }) => ({
  t: lastUpdated ? Date.parse(lastUpdated) : Date.now(),
  pvPower,
  gridPower,
  batteryPower,
  batterySoc,
  loadPower,
  smartPortPower: smartPortPower ?? null,
  outdoorTemp: outdoorTemp ?? null
})

const keepRecent = () => {
  recentStart = Math.max(firstFresh(), recent.length - RECENT_MAX_SAMPLES)
  if (recentStart >= RECENT_COMPACT_AT) compactRecent()
}

const firstFresh = () => {
  if (!recent.length) return 0
  const cutoff = recent.at(-1).t - RECENT_WINDOW_MS
  let index = recentStart
  while (index < recent.length && recent[index].t < cutoff) index += 1
  return index
}

const compactRecent = () => {
  if (recentStart > 0) recent.splice(0, recentStart)
  recentStart = 0
  return recent
}

const retentionMs = () => getSettings().history.retentionDays * DAY_MS

const onRetentionChange = (changed) => {
  if (!changed.includes('history')) return
  periodCache.clear()
  pruneDatabase()
}

const openDatabase = () => {
  try {
    db = openStore(config.paths.historyDb)
    memoryOnly = false
  } catch (error) {
    log(`database unavailable; keeping history in memory only: ${error.message}`)
    db = openStore(MEMORY_DATABASE)
    memoryOnly = true
  }
  statements = prepareStatements()
  storedRows = 0
  lastPruneCutoff = -Infinity
}

const openStore = (path) => {
  const store = new DatabaseSync(path)
  try {
    store.exec('PRAGMA journal_mode = WAL')
    store.exec('PRAGMA synchronous = NORMAL')
    store.exec(CREATE_TABLE)
    ensureSmartPortColumn(store)
    return store
  } catch (error) {
    store.close()
    throw error
  }
}

const prepareStatements = () => ({
  insert: db.prepare(INSERT_ROW),
  exists: db.prepare('SELECT 1 AS found FROM samples WHERE t = ?'),
  pruneBefore: db.prepare('DELETE FROM samples WHERE t < ?'),
  dropOldest: db.prepare('DELETE FROM samples WHERE t < (SELECT t FROM samples ORDER BY t LIMIT 1 OFFSET ?)'),
  count: db.prepare('SELECT COUNT(*) AS count FROM samples'),
  firstTime: db.prepare('SELECT MIN(t) AS t FROM samples WHERE t >= :from AND t < :before'),
  lastTime: db.prepare('SELECT MAX(t) AS t FROM samples WHERE t >= :from AND t < :before'),
  latest: db.prepare(`SELECT ${COLUMNS} FROM samples WHERE t >= :from AND t < :before ORDER BY t DESC LIMIT :limit`),
  rawPage: db.prepare(`SELECT ${COLUMNS} FROM samples WHERE t >= :from AND t < :before ORDER BY t LIMIT :limit`),
  recentFrom: db.prepare(`SELECT ${COLUMNS} FROM samples WHERE t >= ? ORDER BY t`),
  nearestBefore: db.prepare(`SELECT ${COLUMNS} FROM samples WHERE t < ? ORDER BY t DESC LIMIT 1`),
  nearestAfter: db.prepare(`SELECT ${COLUMNS} FROM samples WHERE t > ? ORDER BY t LIMIT 1`),
  bucketed: db.prepare(BUCKETED_ROWS),
  energy: db.prepare(ENERGY_SUMS),
  firstSoc: db.prepare(`${SOC_IN_RANGE} ORDER BY t LIMIT 1`),
  lastSoc: db.prepare(`${SOC_IN_RANGE} ORDER BY t DESC LIMIT 1`)
})

const importLegacySnapshot = () => {
  if (memoryOnly || rowCount() > 0 || !existsSync(config.paths.history)) return
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

const ensureSmartPortColumn = (store) => {
  const columns = store.prepare('PRAGMA table_info(samples)').all().map((column) => column.name)
  if (!columns.includes('smartPortPower')) store.exec('ALTER TABLE samples ADD COLUMN smartPortPower REAL')
}

const loadRecent = () => {
  const newest = lastTime(FULL_RANGE)
  if (newest == null) return []
  log(`restored ${historyStats().count} samples`)
  return statements.recentFrom.all(newest - RECENT_WINDOW_MS)
}

const persist = (sample) => {
  if (!db) return
  try {
    insertRow(sample)
    pruneFrom(sample.t)
    capMemoryOnly()
  } catch (error) {
    log(`insert failed: ${error.message}`)
  }
}

const insertRow = (sample) => {
  if (sample.t <= (lastTime(FULL_RANGE) ?? -Infinity)) periodCache.clear()
  const isNew = !statements.exists.get(sample.t)
  statements.insert.run(...rowValues(sample))
  if (isNew) storedRows += 1
}

const insertMany = (rows) => {
  db.exec('BEGIN')
  try {
    for (const row of rows) statements.insert.run(...rowValues(row))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    log(`import failed: ${error.message}`)
  }
}

const rowValues = ({ t, pvPower, gridPower, batteryPower, batterySoc, loadPower, smartPortPower, outdoorTemp }) =>
  [t, pvPower ?? null, gridPower ?? null, batteryPower ?? null, batterySoc ?? null, loadPower ?? null,
    smartPortPower ?? null, outdoorTemp ?? null]

const rowCount = () => (db ? statements.count.get().count : 0)

const pruneDatabase = () => {
  const newest = lastTime(FULL_RANGE)
  if (newest == null) return
  try {
    pruneFrom(newest, { force: true })
  } catch (error) {
    log(`prune failed: ${error.message}`)
  }
}

const pruneFrom = (newestT, { force = false } = {}) => {
  const cutoff = newestT - retentionMs()
  if (!force && cutoff - lastPruneCutoff < PRUNE_STEP_MS) return
  const { changes } = statements.pruneBefore.run(cutoff)
  storedRows -= changes
  lastPruneCutoff = cutoff
}

const capMemoryOnly = () => {
  if (!memoryOnly || storedRows <= MEMORY_ONLY_MAX_SAMPLES) return
  const { changes } = statements.dropOldest.run(storedRows - MEMORY_ONLY_MAX_SAMPLES)
  storedRows -= changes
  if (changes) periodCache.clear()
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
  smartPortPower REAL,
  outdoorTemp REAL
)`

const INSERT_ROW = `INSERT OR REPLACE INTO samples
  (t, pvPower, gridPower, batteryPower, batterySoc, loadPower, smartPortPower, outdoorTemp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

const bucketOf = (column) => `CAST(CAST(${column} AS REAL) / :every AS INTEGER)`

const BUCKETED_ROWS = `
  WITH RECURSIVE firsts(t) AS (
    SELECT MIN(t) FROM samples WHERE t >= :from AND t < :before
    UNION ALL
    SELECT (
      SELECT MIN(s.t) FROM samples s
      WHERE s.t >= CAST((${bucketOf('firsts.t')} + 1) * :every AS INTEGER) - 1
        AND s.t < :before
        AND ${bucketOf('s.t')} > ${bucketOf('firsts.t')}
    ) FROM firsts WHERE firsts.t IS NOT NULL
  ),
  spans AS (
    SELECT t AS first, LEAD(t) OVER (ORDER BY t) AS next FROM firsts WHERE t IS NOT NULL
  )
  SELECT ${COLUMNS} FROM samples WHERE t IN (
    SELECT (SELECT MAX(s.t) FROM samples s WHERE s.t >= spans.first AND s.t < COALESCE(spans.next, :before))
    FROM spans
  ) ORDER BY t`

const FULL_RANGE = { from: Number.MIN_SAFE_INTEGER, before: Number.MAX_SAFE_INTEGER }

const ENERGY_FIELDS = ['pvPower', 'loadPower', 'gridPower', 'batteryPower', 'smartPortPower']

const ENERGY_GAP_MS = 900000

const MAX_ENERGY_BOUNDS = 33

const PERIOD_CACHE_LIMIT = 400

const periodCache = new Map()

const WATT_MS_PER_KWH = 3600000000

const ENERGY_SUMS = `
  WITH paired AS (
    SELECT t - LAG(t) OVER pair AS dt,
      ${ENERGY_FIELDS.join(', ')}
    FROM samples WHERE t >= :from AND t < :before
    WINDOW pair AS (ORDER BY t)
  )
  SELECT
    ${ENERGY_FIELDS.map((field) => `SUM(CASE WHEN ${field} > 0 THEN ${field} * dt END) AS ${field}Positive,
    SUM(CASE WHEN ${field} < 0 THEN ${field} * dt END) AS ${field}Negative`).join(',\n    ')}
  FROM paired WHERE dt <= :gap`

const SOC_IN_RANGE = 'SELECT batterySoc FROM samples WHERE t >= :from AND t < :before AND batterySoc IS NOT NULL'

const MEMORY_DATABASE = ':memory:'

const MIN_BUCKET_MS = 1000

const PRUNE_STEP_MS = 60000

const RECENT_WINDOW_MS = 26 * 3600000

const RECENT_MAX_SAMPLES = 100000

const RECENT_COMPACT_AT = 10000

const DAY_MS = 86400000

let db = null

let memoryOnly = false

let storedRows = 0

let lastPruneCutoff = -Infinity

let statements = null

let recent = []

let recentStart = 0
