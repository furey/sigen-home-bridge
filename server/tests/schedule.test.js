import { describe, expect, it } from 'vitest'
import { parseScheduleEnv, resolvePollInterval } from '../schedule.js'

const at = (hours, minutes = 0) => new Date(2026, 0, 1, hours, minutes)

describe('parseScheduleEnv', () => {
  it('parses comma-separated windows', () => {
    expect(parseScheduleEnv('08:00-12:00@5000,17:00-21:00@10000')).toEqual([
      { start: '08:00', end: '12:00', intervalMs: 5000 },
      { start: '17:00', end: '21:00', intervalMs: 10000 }
    ])
  })

  it('returns an empty array for blank input', () => {
    expect(parseScheduleEnv('')).toEqual([])
    expect(parseScheduleEnv(undefined)).toEqual([])
  })

  it('drops malformed entries', () => {
    expect(parseScheduleEnv('garbage,08:00-12:00@5000')).toEqual([
      { start: '08:00', end: '12:00', intervalMs: 5000 }
    ])
  })
})

describe('resolvePollInterval', () => {
  const schedule = [{ start: '08:00', end: '12:00', intervalMs: 5000 }]

  it('uses the window interval inside the window', () => {
    expect(resolvePollInterval({ schedule, defaultIntervalMs: 60000, now: at(9) })).toBe(5000)
  })

  it('falls back to the default outside the window', () => {
    expect(resolvePollInterval({ schedule, defaultIntervalMs: 60000, now: at(13) })).toBe(60000)
  })

  it('treats the end boundary as exclusive', () => {
    expect(resolvePollInterval({ schedule, defaultIntervalMs: 60000, now: at(12) })).toBe(60000)
  })

  it('handles windows that wrap past midnight', () => {
    const overnight = [{ start: '22:00', end: '06:00', intervalMs: 30000 }]
    expect(resolvePollInterval({ schedule: overnight, defaultIntervalMs: 60000, now: at(23) })).toBe(30000)
    expect(resolvePollInterval({ schedule: overnight, defaultIntervalMs: 60000, now: at(3) })).toBe(30000)
    expect(resolvePollInterval({ schedule: overnight, defaultIntervalMs: 60000, now: at(12) })).toBe(60000)
  })

  it('returns the default when no schedule is set', () => {
    expect(resolvePollInterval({ schedule: [], defaultIntervalMs: 5000, now: at(9) })).toBe(5000)
  })
})
