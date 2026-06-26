import { computed } from 'vue'
import { useHistory } from './useHistory.js'
import { useSettings } from './useSettings.js'
import { useStateStream } from './useStateStream.js'

export const useBatteryEstimate = () => {
  const { samples } = useHistory()
  const { data } = useSettings()
  const { state } = useStateStream()
  return computed(() => estimateFrom(samples.value, {
    capacityKwh: data.battery.capacityKwh ?? state.ratedEnergyCapacity,
    reserveSoc: data.battery.reserveSoc
  }))
}

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

const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', hour12: true }

const IDLE = { status: 'idle' }

const WARMING = { status: 'warming' }

const estimateFrom = (samples, { capacityKwh = null, reserveSoc = 0 } = {}) => {
  if (!samples.length) return IDLE
  const charging = currentDirection(samples)
  if (charging == null) return IDLE
  const streak = trendStreak(samples, charging)
  const ready = readyEstimate(streak, { charging, capacityKwh, reserveSoc })
  if (ready) return ready
  return stillGathering(streak) ? WARMING : IDLE
}

const readyEstimate = (streak, { charging, capacityKwh, reserveSoc }) => {
  if (!warmEnough(streak, capacityKwh)) return null
  const rate = ratePercentPerHour(streak, { charging, capacityKwh })
  if (rate < MIN_PERCENT_PER_HOUR) return null
  const latest = streak.samples[streak.samples.length - 1]
  const remainingPercent = charging ? 100 - latest.batterySoc : latest.batterySoc - reserveSoc
  if (remainingPercent <= 0) return null
  const minutes = roundedMinutes(remainingPercent / rate)
  if (minutes <= 0 || minutes > MAX_HOURS * 60) return null
  const at = new Date(latest.t + minutes * 60000).toLocaleTimeString([], TIME_FORMAT)
  const label = charging ? 'Full' : reserveSoc > 0 ? 'Reserve' : 'Empty'
  return { status: 'ready', charging, text: `${label} in ${duration(minutes)} ~${at}` }
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
  return {
    samples: run,
    span: latest.t - run[0].t,
    travel: Math.abs(latest.batterySoc - run[0].batterySoc)
  }
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
  const gaps = recent.map((s, i) => (i ? s.t - recent[i - 1].t : null)).filter(Boolean)
  if (!gaps.length) return MIN_GAP_ALLOWANCE_MS
  const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
  return Math.max(median * 3, MIN_GAP_ALLOWANCE_MS)
}

const socSlopePerHour = (samples) => {
  const points = samples.map((s) => ({ x: (s.t - samples[0].t) / 3600000, y: s.batterySoc }))
  const meanX = mean(points.map((p) => p.x))
  const meanY = mean(points.map((p) => p.y))
  const covariance = sum(points.map((p) => (p.x - meanX) * (p.y - meanY)))
  const variance = sum(points.map((p) => (p.x - meanX) ** 2))
  return variance === 0 ? 0 : covariance / variance
}

const roundedMinutes = (hours) => Math.round((hours * 60) / ROUND_MINUTES) * ROUND_MINUTES

const duration = (minutes) => {
  const wholeHours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!wholeHours) return `${remainder}m`
  if (!remainder) return `${wholeHours}h`
  return `${wholeHours}h ${remainder}m`
}

const mean = (values) => sum(values) / values.length

const sum = (values) => values.reduce((total, value) => total + value, 0)
