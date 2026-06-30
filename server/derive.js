export const costPerHour = ({ gridWatts, importRate, exportRate }) => {
  if (Math.abs(gridWatts) < GRID_DEADBAND_WATTS) return 0
  const rate = gridWatts >= 0 ? importRate : exportRate
  return (gridWatts / 1000) * rate
}

export const activeRate = ({ windows, defaultRate, minutes }) => {
  const hit = (windows ?? []).find((window) => withinWindow(window, minutes))
  return hit ? hit.rate : defaultRate
}

export const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes()

export const netPerHour = ({ tariff, gridWatts, now }) => {
  const minutes = minutesOfDay(now)
  const perHour = costPerHour({
    gridWatts,
    importRate: activeRate({ windows: tariff.importWindows, defaultRate: tariff.importRate, minutes }),
    exportRate: activeRate({ windows: tariff.exportWindows, defaultRate: tariff.exportRate, minutes })
  })
  return -perHour
}

export const dailyCost = ({ samples, tariff, now }) => {
  const dayStart = startOfDay(now).getTime()
  const today = (samples ?? []).filter((sample) => Number.isFinite(sample?.t) && sample.t >= dayStart)
  const tally = accumulate(today, tariff)
  const superExportCredit = tariff.superExportCredit.enabled
    ? Math.min(tally.superExportKwh, tariff.superExportCredit.capKwh) * tariff.superExportCredit.rate
    : 0
  const zeroDrawMet = tally.zeroDrawImportKwh <= ZERO_DRAW_TOLERANCE_KWH
  const zeroDrawCredit = tariff.zeroDrawCredit.enabled && zeroDrawMet ? tariff.zeroDrawCredit.perDay : 0
  const supply = tariff.supplyChargePerDay
  const net = tally.feedIn + superExportCredit + zeroDrawCredit - tally.importCost - supply
  return {
    importCost: tally.importCost,
    feedIn: tally.feedIn,
    superExportCredit,
    zeroDrawCredit,
    zeroDrawMet,
    supply,
    net
  }
}

export const tariffConfigured = (tariff) =>
  tariff.importRate > 0 ||
  tariff.exportRate > 0 ||
  tariff.importWindows.length > 0 ||
  tariff.exportWindows.length > 0 ||
  tariff.supplyChargePerDay > 0 ||
  tariff.zeroDrawCredit.enabled ||
  tariff.superExportCredit.enabled

export const socPercent = (soc) => {
  const value = Number(soc) || 0
  if (value <= 0) return 0
  if (value >= 100) return 100
  return Math.min(99, Math.max(1, Math.round(value)))
}

export const batteryEstimate = (samples, { capacityKwh = null, reserveSoc = 0 } = {}) => {
  if (!samples.length) return IDLE
  const charging = currentDirection(samples)
  if (charging == null) return IDLE
  const streak = trendStreak(samples, charging)
  const ready = readyEstimate(streak, { charging, capacityKwh, reserveSoc })
  if (ready) return ready
  return stillGathering(streak) ? WARMING : IDLE
}

const accumulate = (samples, tariff) => {
  const tally = { importCost: 0, feedIn: 0, superExportKwh: 0, zeroDrawImportKwh: 0 }
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]
    const current = samples[index]
    const elapsedMs = current.t - previous.t
    if (elapsedMs <= 0 || elapsedMs > MAX_GAP_MS) continue
    const hours = elapsedMs / MS_PER_HOUR
    const watts = (previous.gridPower + current.gridPower) / 2
    if (Math.abs(watts) < GRID_DEADBAND_WATTS) continue
    const minutes = minutesOfDay(new Date(previous.t + elapsedMs / 2))
    if (watts >= 0) {
      const kwh = (watts / 1000) * hours
      tally.importCost +=
        kwh * activeRate({ windows: tariff.importWindows, defaultRate: tariff.importRate, minutes })
      if (withinWindow(tariff.zeroDrawCredit, minutes)) tally.zeroDrawImportKwh += kwh
    } else {
      const kwh = (-watts / 1000) * hours
      tally.feedIn +=
        kwh * activeRate({ windows: tariff.exportWindows, defaultRate: tariff.exportRate, minutes })
      if (withinWindow(tariff.superExportCredit, minutes)) tally.superExportKwh += kwh
    }
  }
  return tally
}

const withinWindow = ({ start, end }, minutes) => {
  const from = clockToMinutes(start)
  const to = clockToMinutes(end)
  if (from === to) return false
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

const startOfDay = (date) => {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

const clockToMinutes = (clock) => {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

const readyEstimate = (streak, { charging, capacityKwh, reserveSoc }) => {
  if (!warmEnough(streak, capacityKwh)) return null
  const rate = ratePercentPerHour(streak, { charging, capacityKwh })
  if (rate < MIN_PERCENT_PER_HOUR) return null
  const latest = streak.samples[streak.samples.length - 1]
  const remainingPercent = charging ? 100 - latest.batterySoc : latest.batterySoc - reserveSoc
  if (remainingPercent <= 0) return null
  const minutesRemaining = roundedMinutes(remainingPercent / rate)
  if (minutesRemaining <= 0 || minutesRemaining > MAX_HOURS * 60) return null
  return {
    status: 'ready',
    direction: charging ? 'charge' : 'discharge',
    target: charging ? 'full' : reserveSoc > 0 ? 'reserve' : 'empty',
    minutesRemaining,
    etaIso: new Date(latest.t + minutesRemaining * 60000).toISOString(),
    energyToGoKwh: capacityKwh ? (capacityKwh * remainingPercent) / 100 : null
  }
}

const warmEnough = ({ samples, span, travel }, capacityKwh) =>
  samples.length >= MIN_SAMPLES && span >= MIN_SPAN_MS && (capacityKwh ? true : travel >= MIN_SOC_TRAVEL)

const ratePercentPerHour = ({ samples }, { charging, capacityKwh }) => {
  if (capacityKwh) return Math.abs(smoothedPowerWatts(samples)) / (10 * capacityKwh)
  const slope = socSlopePerHour(samples)
  return charging ? slope : -slope
}

const smoothedPowerWatts = (samples) => {
  const latest = samples[samples.length - 1]
  let weightedSum = 0
  let weightTotal = 0
  for (const sample of samples) {
    const weight = Math.exp(-(latest.t - sample.t) / RATE_TAU_MS)
    weightedSum += weight * sample.batteryPower
    weightTotal += weight
  }
  return weightTotal === 0 ? 0 : weightedSum / weightTotal
}

const stillGathering = ({ samples, span }) => samples.length < MIN_SAMPLES || span < MIN_SPAN_MS

const trendStreak = (samples, charging) => {
  const latest = samples[samples.length - 1]
  const cutoff = latest.t - WINDOW_MS
  const maxGap = allowedGapMs(samples)
  let start = samples.length - 1
  while (start > 0) {
    const prev = samples[start - 1]
    const gapped = samples[start].t - prev.t > maxGap
    const opposed = directionOf(prev) === !charging
    if (prev.t < cutoff || gapped || opposed) break
    start--
  }
  const run = samples.slice(start)
  return { samples: run, span: latest.t - run[0].t, travel: Math.abs(latest.batterySoc - run[0].batterySoc) }
}

const currentDirection = (samples) => {
  const latest = samples[samples.length - 1]
  for (let i = samples.length - 1; i >= 0; i--) {
    if (latest.t - samples[i].t > DIRECTION_LOOKBACK_MS) return null
    const direction = directionOf(samples[i])
    if (direction != null) return direction
  }
  return null
}

const directionOf = ({ batteryPower }) => {
  if (batteryPower > NOISE_WATTS) return true
  if (batteryPower < -NOISE_WATTS) return false
  return null
}

const allowedGapMs = (samples) => {
  const recent = samples.slice(-20)
  const gaps = recent.map((sample, index) => (index ? sample.t - recent[index - 1].t : null)).filter(Boolean)
  if (!gaps.length) return MIN_GAP_ALLOWANCE_MS
  const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
  return Math.max(median * 3, MIN_GAP_ALLOWANCE_MS)
}

const socSlopePerHour = (samples) => {
  const points = samples.map((sample) => ({ x: (sample.t - samples[0].t) / 3600000, y: sample.batterySoc }))
  const meanX = mean(points.map((point) => point.x))
  const meanY = mean(points.map((point) => point.y))
  const covariance = sum(points.map((point) => (point.x - meanX) * (point.y - meanY)))
  const variance = sum(points.map((point) => (point.x - meanX) ** 2))
  return variance === 0 ? 0 : covariance / variance
}

const roundedMinutes = (hours) => Math.round((hours * 60) / ROUND_MINUTES) * ROUND_MINUTES

const mean = (values) => sum(values) / values.length

const sum = (values) => values.reduce((total, value) => total + value, 0)

const IDLE = { status: 'idle' }

const WARMING = { status: 'warming' }

const MS_PER_HOUR = 3600000

const MAX_GAP_MS = 900000

const GRID_DEADBAND_WATTS = 50

const ZERO_DRAW_TOLERANCE_KWH = 0.05

const WINDOW_MS = 15 * 60 * 1000

const RATE_TAU_MS = 90 * 1000

const MIN_SPAN_MS = 60 * 1000

const MIN_SOC_TRAVEL = 0.35

const MIN_SAMPLES = 5

const DIRECTION_LOOKBACK_MS = 60 * 1000

const MIN_GAP_ALLOWANCE_MS = 30 * 1000

const NOISE_WATTS = 100

const MIN_PERCENT_PER_HOUR = 0.5

const MAX_HOURS = 24

const ROUND_MINUTES = 5
