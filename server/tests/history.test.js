import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'sigen-history-'))

process.env.DATA_DIR = dataDir
process.env.HISTORY_RETENTION_DAYS = '7'

const {
  startHistory, getHistory, getHistoryAll, recordSample, downsampleHistory, historyToCsv, historyStats,
  historyExportChunks, exportRows, nearestSample, legacyImportRows, LIVE_LIMIT
} = await import('../history.js')

const TEST_CLOCK = Date.parse('2500-01-01T00:00:00.000Z')

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: TEST_CLOCK })
  startHistory()
})

afterAll(() => {
  vi.useRealTimers()
  rmSync(dataDir, { recursive: true, force: true })
})

const DAY_MS = 86400000

const reading = (overrides = {}) => ({
  lastUpdated: '2026-06-11T10:00:00.000Z',
  pvPower: 3200,
  gridPower: -1100,
  batteryPower: 2100,
  batterySoc: 81.5,
  loadPower: 1000,
  smartPortPower: 350,
  connected: true,
  outdoorTemp: 18,
  ...overrides
})

describe('history', () => {
  it('records a timestamped sample of the metric fields plus outdoor temp', () => {
    recordSample(reading())
    expect(getHistory().at(-1)).toEqual({
      t: Date.parse('2026-06-11T10:00:00.000Z'),
      pvPower: 3200,
      gridPower: -1100,
      batteryPower: 2100,
      batterySoc: 81.5,
      loadPower: 1000,
      smartPortPower: 350,
      outdoorTemp: 18
    })
  })

  it('records a null outdoor temp when no reading exists yet', () => {
    recordSample(reading({ outdoorTemp: null }))
    expect(getHistory().at(-1).outdoorTemp).toBeNull()
  })

  it('records a null smart port power when no smart loads are detected', () => {
    recordSample(reading({ smartPortPower: null }))
    expect(getHistory().at(-1).smartPortPower).toBeNull()
  })

  it('falls back to now when the reading has no timestamp', () => {
    vi.setSystemTime(Date.parse('2026-06-12T00:00:00.000Z'))
    recordSample(reading({ lastUpdated: null }))
    expect(getHistory().at(-1).t).toBe(Date.parse('2026-06-12T00:00:00.000Z'))
    vi.setSystemTime(TEST_CLOCK)
  })
})

describe('history retention', () => {
  it('drops samples older than the window, measured from the newest sample', () => {
    const base = Date.parse('2031-01-01T00:00:00.000Z')
    recordSample(reading({ lastUpdated: new Date(base).toISOString(), loadPower: 111 }))
    recordSample(reading({ lastUpdated: new Date(base + 10 * DAY_MS).toISOString(), loadPower: 222 }))
    const all = getHistory({ since: base - DAY_MS })
    expect(all.some((sample) => sample.loadPower === 111)).toBe(false)
    expect(all.at(-1).loadPower).toBe(222)
  })

  it('keeps samples within the window', () => {
    const base = Date.parse('2032-01-01T00:00:00.000Z')
    recordSample(reading({ lastUpdated: new Date(base).toISOString(), loadPower: 333 }))
    recordSample(reading({ lastUpdated: new Date(base + 3 * DAY_MS).toISOString(), loadPower: 444 }))
    const all = getHistory({ since: base - DAY_MS })
    expect(all.some((sample) => sample.loadPower === 333)).toBe(true)
    expect(all.some((sample) => sample.loadPower === 444)).toBe(true)
  })

  it('holds only the last 26 hours in memory', () => {
    const base = Date.parse('2033-01-01T00:00:00.000Z')
    recordSample(reading({ lastUpdated: new Date(base).toISOString(), loadPower: 555 }))
    recordSample(reading({ lastUpdated: new Date(base + 25 * 3600000).toISOString(), loadPower: 666 }))
    recordSample(reading({ lastUpdated: new Date(base + 27 * 3600000).toISOString(), loadPower: 777 }))
    expect(getHistoryAll().map((sample) => sample.loadPower)).toEqual([666, 777])
    expect(getHistory({ since: base }).map((sample) => sample.loadPower)).toEqual([555, 666, 777])
  })
})

describe('history downsampling', () => {
  it('keeps the last sample in each interval bucket', () => {
    const rows = [
      { t: 0, loadPower: 1 },
      { t: 30000, loadPower: 2 },
      { t: 61000, loadPower: 3 },
      { t: 119000, loadPower: 4 },
      { t: 200000, loadPower: 5 }
    ]
    expect(downsampleHistory(rows, 60000).map((row) => row.loadPower)).toEqual([2, 4, 5])
  })

  it('returns rows unchanged for a non-positive interval', () => {
    const rows = [{ t: 0 }, { t: 1 }]
    expect(downsampleHistory(rows, 0)).toBe(rows)
  })
})

describe('history CSV', () => {
  it('writes a header and ISO-timestamped rows with blanks for nulls', () => {
    const csv = historyToCsv([
      { t: Date.parse('2026-06-11T10:00:00.000Z'), pvPower: 3200, gridPower: -1100, batteryPower: 2100, batterySoc: 81.5, loadPower: 1000, smartPortPower: 350, outdoorTemp: 18 },
      { t: Date.parse('2026-06-11T10:00:05.000Z'), pvPower: 0, gridPower: 0, batteryPower: 0, batterySoc: 80, loadPower: 0, smartPortPower: null, outdoorTemp: null }
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('time,pvPower,gridPower,batteryPower,batterySoc,loadPower,smartPortPower,outdoorTemp')
    expect(lines[1]).toBe('2026-06-11T10:00:00.000Z,3200,-1100,2100,81.5,1000,350,18')
    expect(lines[2]).toBe('2026-06-11T10:00:05.000Z,0,0,0,80,0,,')
  })
})

describe('history stats', () => {
  it('reports the count and time span of the retained samples', () => {
    const stored = [...exportRows()]
    expect(historyStats()).toEqual({ count: stored.length, firstT: stored[0].t, lastT: stored.at(-1).t })
  })
})

describe('legacy import', () => {
  it('keeps the original sample timestamps and drops malformed rows', () => {
    const rows = legacyImportRows([
      { t: 1000, pvPower: 1, gridPower: 2, batteryPower: 3, batterySoc: 50, loadPower: 4, outdoorTemp: 10 },
      { t: 2000, pvPower: 5, gridPower: 6, batteryPower: 7, batterySoc: 60, loadPower: 8, outdoorTemp: 11 },
      { pvPower: 9 }
    ])
    expect(rows.map((row) => row.t)).toEqual([1000, 2000])
  })

  it('returns an empty list for a non-array snapshot', () => {
    expect(legacyImportRows(null)).toEqual([])
    expect(legacyImportRows({})).toEqual([])
  })
})

describe('history limits', () => {
  it('caps the live feed at LIVE_LIMIT', () => {
    const base = Date.parse('2040-01-01T00:00:00.000Z')
    for (let index = 0; index < LIVE_LIMIT + 5; index += 1) {
      recordSample(reading({ lastUpdated: new Date(base + index * 1000).toISOString(), loadPower: index }))
    }
    expect(getHistory().length).toBe(LIVE_LIMIT)
    expect(getHistory().at(-1).loadPower).toBe(LIVE_LIMIT + 4)
    expect(getHistory()[0].loadPower).toBe(5)
  }, 30000)
})

describe('history query options', () => {
  const base = Date.parse('2128-01-01T00:00:00.000Z')
  const at = (index) => base + index * 60000
  const loads = (rows) => rows.map((row) => row.loadPower)

  beforeAll(() => {
    for (let index = 0; index < 5; index += 1) {
      recordSample(reading({ lastUpdated: new Date(at(index)).toISOString(), loadPower: index + 1 }))
    }
  })

  it('returns the samples oldest first by default', () => {
    expect(loads(getHistory())).toEqual([1, 2, 3, 4, 5])
  })

  it('reverses to newest first on order desc', () => {
    expect(loads(getHistory({ order: 'desc' }))).toEqual([5, 4, 3, 2, 1])
  })

  it('limits to the most recent n while keeping the requested order', () => {
    expect(loads(getHistory({ limit: 2 }))).toEqual([4, 5])
    expect(loads(getHistory({ limit: 2, order: 'desc' }))).toEqual([5, 4])
  })

  it('bounds the time range inclusively with since and until', () => {
    expect(loads(getHistory({ since: at(2) }))).toEqual([3, 4, 5])
    expect(loads(getHistory({ until: at(1) }))).toEqual([1, 2])
    expect(loads(getHistory({ since: at(1), until: at(3) }))).toEqual([2, 3, 4])
  })

  it('clamps a non-positive or oversized limit to the live window', () => {
    expect(loads(getHistory({ limit: 0 }))).toEqual([1, 2, 3, 4, 5])
    expect(loads(getHistory({ limit: LIVE_LIMIT + 100 }))).toEqual([1, 2, 3, 4, 5])
  })

  it('downsamples to one row per bucket when every is set', () => {
    expect(loads(getHistory({ every: 120000 }))).toEqual([2, 4, 5])
    expect(loads(getHistory({ every: 120000, order: 'desc' }))).toEqual([5, 4, 2])
  })

  it('keeps every within the since/until window', () => {
    expect(loads(getHistory({ since: at(1), until: at(3), every: 60000 }))).toEqual([2, 3, 4])
  })
})

describe('history downsampled window read', () => {
  const base = Date.parse('2200-01-01T00:00:00.000Z')

  beforeAll(() => {
    for (let index = 0; index <= 30000; index += 1) {
      recordSample(reading({ lastUpdated: new Date(base + index * 1000).toISOString(), loadPower: index }))
    }
  })

  it('reads the whole window past the live cap when every is set', () => {
    const live = getHistory()
    expect(live.length).toBe(LIVE_LIMIT)
    expect(live[0].loadPower).toBe(30000 - LIVE_LIMIT + 1)
    const bucketed = getHistory({ every: 60000 })
    expect(bucketed.length).toBeLessThan(LIVE_LIMIT)
    expect(bucketed[0].loadPower).toBeLessThan(live[0].loadPower)
    expect(bucketed[0].loadPower).toBe(59)
  })

  it('floors an over-fine bucket so the output stays bounded near the live cap', () => {
    expect(getHistory({ every: 1 }).length).toBeLessThanOrEqual(LIVE_LIMIT + 1)
  })
})

describe('history nearest sample', () => {
  const base = Date.parse('2300-01-01T00:00:00.000Z')
  const at = (seconds) => base + seconds * 1000

  beforeAll(() => {
    for (const seconds of [0, 60, 120, 3600, 3660]) {
      recordSample(reading({ lastUpdated: new Date(at(seconds)).toISOString(), loadPower: seconds }))
    }
  })

  it('finds the newest sample strictly before a time, skipping a gap', () => {
    expect(nearestSample({ before: at(3600) }).loadPower).toBe(120)
    expect(nearestSample({ before: at(130) }).loadPower).toBe(120)
  })

  it('finds the oldest sample strictly after a time, skipping a gap', () => {
    expect(nearestSample({ after: at(120) }).loadPower).toBe(3600)
    expect(nearestSample({ after: at(50) }).loadPower).toBe(60)
  })

  it('returns null past either end', () => {
    expect(nearestSample({ before: at(0) })).toBeNull()
    expect(nearestSample({ after: at(3660) })).toBeNull()
    expect(nearestSample({})).toBeNull()
  })
})

describe('history export chunks', () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    t: Date.parse('2026-06-11T10:00:00.000Z') + index * 5000,
    pvPower: index, gridPower: null, batteryPower: -index, batterySoc: 50.5,
    loadPower: 1000, smartPortPower: index % 2 ? null : 7, outdoorTemp: null
  }))
  const joined = (format, slice) =>
    [...historyExportChunks({ rows: slice, format, sliceSize: 3 })].join('')

  it('splits rows into several slices', () => {
    expect([...historyExportChunks({ rows, format: 'csv', sliceSize: 3 })]).toHaveLength(4)
  })

  it('matches the buffered CSV for full, partial, and empty exports', () => {
    for (const slice of [rows, rows.slice(0, 3), rows.slice(0, 1), []]) {
      expect(joined('csv', slice)).toBe(historyToCsv(slice))
    }
  })

  it('matches the buffered JSON for full, partial, and empty exports', () => {
    for (const slice of [rows, rows.slice(0, 3), rows.slice(0, 1), []]) {
      expect(joined('json', slice)).toBe(JSON.stringify(slice))
    }
  })
})

describe('history database downsampling', () => {
  const base = Date.parse('2400-01-01T00:00:00.000Z')
  const offsets = Array.from({ length: 4000 }, (_, index) => index * 5000 + ((index * 7919) % 4999))
    .filter((offset, index) => index % 97 > 9)

  beforeAll(() => {
    for (const [index, offset] of offsets.entries()) {
      recordSample(reading({ lastUpdated: new Date(base + offset).toISOString(), loadPower: index }))
    }
  })

  it('matches the in-memory downsample for whole and fractional buckets', () => {
    const raw = getHistory({ since: base, limit: LIVE_LIMIT })
    for (const every of [5000, 7000, 60000, 1234.567, 1000.5]) {
      const since = base + 12345.6
      const until = base + 15000000.4
      const window = raw.filter((row) => row.t >= since && row.t <= until)
      expect(getHistory({ since, until, every })).toEqual(downsampleHistory(window, every))
    }
  })

  it('matches the in-memory downsample on export pages', () => {
    const raw = [...exportRows()]
    for (const everyMs of [60000, 1000, 13000]) {
      expect([...exportRows({ everyMs })]).toEqual(downsampleHistory(raw, everyMs))
    }
  })
})
