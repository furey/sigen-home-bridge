export const resolvePollInterval = ({ schedule, defaultIntervalMs, now }) => {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const active = schedule.find((window) => isWithin(window, minutes))
  return active ? active.intervalMs : defaultIntervalMs
}

export const parseScheduleEnv = (raw) => {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseEntry)
    .filter(Boolean)
}

export const windowToMinutes = ({ start, end }) => ({
  start: clockToMinutes(start),
  end: clockToMinutes(end)
})

const isWithin = (window, minutes) => {
  const { start, end } = windowToMinutes(window)
  if (start === end) return false
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end
}

const parseEntry = (entry) => {
  const match = entry.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})@(\d+)$/)
  if (!match) return null
  const [, start, end, intervalMs] = match
  return { start, end, intervalMs: Number(intervalMs) }
}

const clockToMinutes = (clock) => {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}
