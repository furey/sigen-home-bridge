import { describe, expect, it } from 'vitest'
import { calendarLabel, calendarTicks, calendarWindow } from './trendWindow.js'

const HOUR_MS = 3600000

const local = (text) => new Date(text).getTime()

describe('calendar trend windows', () => {
  it('spans today from local midnight to the next midnight', () => {
    const { start, end } = calendarWindow({ mode: 'day', now: local('2026-11-06T20:32:00') })
    expect(start).toBe(local('2026-11-06T00:00:00'))
    expect(end).toBe(local('2026-11-07T00:00:00'))
  })

  it('steps back whole days', () => {
    const { start } = calendarWindow({ mode: 'day', offset: 2, now: local('2026-11-06T20:32:00') })
    expect(start).toBe(local('2026-11-04T00:00:00'))
  })

  it('gives the daylight saving start day 23 hours', () => {
    const { start, end } = calendarWindow({ mode: 'day', now: local('2026-10-04T12:00:00') })
    expect((end - start) / HOUR_MS).toBe(23)
  })

  it('gives the daylight saving end day 25 hours', () => {
    const { start, end } = calendarWindow({ mode: 'day', now: local('2027-04-04T12:00:00') })
    expect((end - start) / HOUR_MS).toBe(25)
  })

  it('makes a week the last seven days ending today', () => {
    const { start, end } = calendarWindow({ mode: 'week', now: local('2026-11-06T20:32:00') })
    expect(start).toBe(local('2026-10-31T00:00:00'))
    expect(end).toBe(local('2026-11-07T00:00:00'))
  })

  it('steps back whole weeks', () => {
    const { start, end } = calendarWindow({ mode: 'week', offset: 1, now: local('2026-11-06T20:32:00') })
    expect(start).toBe(local('2026-10-24T00:00:00'))
    expect(end).toBe(local('2026-10-31T00:00:00'))
  })

  it('spans the calendar month', () => {
    const { start, end } = calendarWindow({ mode: 'month', now: local('2026-11-06T20:32:00') })
    expect(start).toBe(local('2026-11-01T00:00:00'))
    expect(end).toBe(local('2026-12-01T00:00:00'))
  })

  it('steps back across a year boundary from the 31st', () => {
    const { start, end } = calendarWindow({ mode: 'month', offset: 1, now: local('2027-01-31T09:00:00') })
    expect(start).toBe(local('2026-12-01T00:00:00'))
    expect(end).toBe(local('2027-01-01T00:00:00'))
  })
})

describe('calendar trend labels', () => {
  it('names today and yesterday', () => {
    const now = local('2026-11-06T20:32:00')
    expect(calendarLabel({ mode: 'day', offset: 0, ...calendarWindow({ mode: 'day', now }) })).toBe('Today')
    expect(calendarLabel({ mode: 'day', offset: 1, ...calendarWindow({ mode: 'day', offset: 1, now }) }))
      .toBe('Yesterday')
  })

  it('ends a week label on its last day, not the next midnight', () => {
    const window = calendarWindow({ mode: 'week', now: local('2026-11-06T20:32:00') })
    expect(calendarLabel({ mode: 'week', ...window })).toMatch(/6 Nov$/)
  })
})

describe('calendar trend ticks', () => {
  it('marks a day every six hours, midnight to midnight', () => {
    const window = calendarWindow({ mode: 'day', now: local('2026-11-06T20:32:00') })
    const ticks = calendarTicks({ mode: 'day', ...window })
    expect(ticks.map((tick) => tick.t)).toEqual([0, 6, 12, 18, 24].map((hour) => window.start + hour * HOUR_MS))
  })

  it('keeps six-hour ticks on the clock across the daylight saving start', () => {
    const window = calendarWindow({ mode: 'day', now: local('2026-10-04T12:00:00') })
    const ticks = calendarTicks({ mode: 'day', ...window })
    expect(ticks[1].t).toBe(local('2026-10-04T06:00:00'))
    expect(ticks.at(-1).t).toBe(window.end)
  })

  it('labels each day of a week at its midday', () => {
    const window = calendarWindow({ mode: 'week', now: local('2026-11-06T20:32:00') })
    const ticks = calendarTicks({ mode: 'week', ...window })
    expect(ticks).toHaveLength(7)
    expect(ticks[0].t).toBe(local('2026-10-31T12:00:00'))
    expect(ticks.at(-1).t).toBe(local('2026-11-06T12:00:00'))
  })

  it('drops the 29th from a February', () => {
    const window = calendarWindow({ mode: 'month', now: local('2027-02-10T09:00:00') })
    expect(calendarTicks({ mode: 'month', ...window })).toHaveLength(4)
  })
})

describe('calendar windows across clock changes', () => {
  it('keeps a week spanning the daylight saving start at seven midnights', () => {
    const { start, end } = calendarWindow({ mode: 'week', now: local('2026-10-06T09:00:00') })
    expect(start).toBe(local('2026-09-30T00:00:00'))
    expect(end).toBe(local('2026-10-07T00:00:00'))
    expect((end - start) / HOUR_MS).toBe(167)
  })

  it('names a month by month and year', () => {
    const window = calendarWindow({ mode: 'month', now: local('2026-11-06T20:32:00') })
    expect(calendarLabel({ mode: 'month', ...window })).toBe('November 2026')
  })

  it('keeps the 29th in a leap February', () => {
    const window = calendarWindow({ mode: 'month', now: local('2028-02-10T09:00:00') })
    expect(calendarTicks({ mode: 'month', ...window })).toHaveLength(5)
  })
})
