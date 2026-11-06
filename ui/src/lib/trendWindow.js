export const calendarWindow = ({ mode, offset = 0, now }) => {
  if (mode === 'day') return { start: dayStart(now, -offset), end: dayStart(now, 1 - offset) }
  if (mode === 'week') {
    return { start: dayStart(now, -6 - WEEK_DAYS * offset), end: dayStart(now, 1 - WEEK_DAYS * offset) }
  }
  return { start: monthStart(now, -offset), end: monthStart(now, 1 - offset) }
}

export const calendarLabel = ({ mode, offset = 0, start, end }) => {
  if (mode === 'day') return dayLabel(start, offset)
  if (mode === 'week') return `${dayMonth(start)} – ${dayMonth(end - 1)}`
  return new Date(start).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

export const calendarTicks = ({ mode, start, end }) => {
  if (mode === 'day') return DAY_TICK_HOURS.map((hour) => hourTick(start, hour))
  if (mode === 'week') return Array.from({ length: WEEK_DAYS }, (_, index) => weekdayTick(start, index))
  return MONTH_TICK_DAYS.map((day) => monthDayTick(start, day)).filter((tick) => tick.t < end)
}

const hourTick = (start, hour) => {
  const date = new Date(start)
  date.setHours(hour)
  return { t: date.getTime(), label: date.toLocaleTimeString([], { hour: 'numeric' }) }
}

const weekdayTick = (start, index) => {
  const date = new Date(start)
  date.setDate(date.getDate() + index)
  date.setHours(12)
  return { t: date.getTime(), label: date.toLocaleDateString([], { weekday: 'short' }) }
}

const monthDayTick = (start, day) => {
  const date = new Date(start)
  date.setDate(day)
  return { t: date.getTime(), label: dayMonth(date.getTime()) }
}

const dayLabel = (start, offset) => {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Yesterday'
  return new Date(start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

const dayMonth = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })

const dayStart = (t, days) => {
  const date = new Date(t)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

const monthStart = (t, months) => {
  const date = new Date(t)
  date.setHours(0, 0, 0, 0)
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  return date.getTime()
}

const WEEK_DAYS = 7

const DAY_TICK_HOURS = [0, 6, 12, 18, 24]

const MONTH_TICK_DAYS = [1, 8, 15, 22, 29]
