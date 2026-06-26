<script setup>
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useStateStream } from '../composables/useStateStream.js'
import { useHistory } from '../composables/useHistory.js'
import { TREND_RANGES, rangeFor, useDashboardView } from '../composables/useDashboardView.js'
import { ChevronLast, ChevronLeft, ChevronRight, Clock, History } from '@lucide/vue'
import { useHoverCapable } from '../composables/useHoverCapable.js'
import { useScrub } from '../composables/useScrub.js'
import {
  FLOW_SHADES, accentFor, categoryAccentFor, directionFor, flowAccentFor, flowIconFor, formatPower,
  iconFor, metricByKey
} from '../lib/metrics.js'
import { themeColors } from '../lib/theme.js'
import { skyGradientStops, sunCrossings } from '../lib/sun.js'

const { state } = useStateStream()
const { samples } = useHistory()
const { view, setRange, toggleMetric } = useDashboardView()
const hoverCapable = useHoverCapable()

const stage = ref(null)
const header = ref(null)
const legendGroup = ref(null)
const pillsGroup = ref(null)
const headerWrapped = ref(false)
const size = ref({ width: 0, height: 0 })
const now = ref(Date.now())
const scrubT = ref(null)
const panEnd = ref(null)
const historyStats = ref(null)
const windowSamples = ref([])
const windowSamplesKey = ref('')
const snapping = ref(false)

let resizeObserver = null
let headerObserver = null
let ticker = null
let statsTicker = null
let windowToken = 0
let panDir = 0
let snappedOnce = false

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  resizeObserver.observe(stage.value)
  headerObserver = new ResizeObserver(() => {
    const legend = legendGroup.value
    const pillsEl = pillsGroup.value
    if (!legend || !pillsEl) return
    headerWrapped.value = pillsEl.getBoundingClientRect().top >= legend.getBoundingClientRect().bottom
  })
  headerObserver.observe(header.value)
  ticker = setInterval(() => { now.value = Date.now() }, TICK_MS)
  statsTicker = setInterval(loadStats, STATS_INTERVAL_MS)
  loadStats()
  document.addEventListener('visibilitychange', onVisibility)
  if (hoverCapable.value) window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  headerObserver?.disconnect()
  clearInterval(ticker)
  clearInterval(statsTicker)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('keydown', onKey)
  sharedScrub.value = null
})

const onKey = (event) => {
  if (event.key === 'Escape') return dismissRangeNotice()
  if (event.key === 'ArrowLeft') return stepEarlier()
  if (event.key === 'ArrowRight') return stepLater()
  if (event.key === 'ArrowUp') return stepZoom(-1)
  if (event.key === 'ArrowDown') return stepZoom(1)
}

const onVisibility = () => {
  if (document.visibilityState !== 'visible') return
  loadStats()
  loadWindow()
}

const pollMs = computed(() => state.pollIntervalMs ?? POLL_FALLBACK_MS)
const firstT = computed(() => historyStats.value?.firstT ?? null)
const retainedSpanMs = computed(() => {
  const stats = historyStats.value
  return stats && Number.isFinite(stats.firstT) ? stats.lastT - stats.firstT : 0
})
const pills = computed(() => TREND_RANGES.filter((option, index) =>
  option.ms <= DAY_MS || retainedSpanMs.value > TREND_RANGES[index - 1].ms))
const rangeDisabled = (option) => option.ms < pollMs.value * MIN_RANGE_POINTS
const enabledRanges = computed(() => pills.value.filter((option) => !rangeDisabled(option)))

const stepZoom = (delta) => {
  const options = enabledRanges.value
  const index = options.findIndex((option) => option.key === view.range) + delta
  if (index < 0 || index >= options.length) return
  setRange(options[index].key)
}

watchEffect(() => {
  const options = enabledRanges.value
  if (!options.length) return
  const current = rangeFor(view.range)
  const pollBlocked = rangeDisabled(current)
  const retentionBlocked = historyStats.value != null
    && current.ms > DAY_MS
    && !pills.value.some((option) => option.key === current.key)
  if (!pollBlocked && !retentionBlocked) return
  const replacement = options.find((option) => option.ms > current.ms) ?? options.at(-1)
  setRange(replacement.key)
})

const rangeNotice = ref(null)
const pickRange = (option) => {
  if (!rangeDisabled(option)) return setRange(option.key)
  rangeNotice.value = {
    label: option.label,
    interval: intervalLabel(pollMs.value),
    needed: intervalLabel(option.ms / MIN_RANGE_POINTS)
  }
}
const dismissRangeNotice = () => { rangeNotice.value = null }

const intervalLabel = (ms) => {
  if (ms >= 60000) {
    const minutes = Math.round(ms / 60000)
    return minutes === 1 ? 'minute' : `${minutes} minutes`
  }
  return `${Math.round(ms / 1000)} seconds`
}

const legend = computed(() => LEGEND_KEYS.map((key) => {
  const metric = metricByKey(key)
  const tally = scrubSample.value ? pointTally(metric, key) : windowTally(metric, key)
  return {
    key,
    title: tally.direction ? `${metric.label} (${tally.direction})` : metric.label,
    icon: tally.icon,
    isArrow: tally.isArrow,
    iconColor: tally.iconColor,
    value: tally.value,
    unit: tally.unit,
    color: tally.color,
    hidden: view.hidden.includes(key),
    toggle: toggleHint(key)
  }
}))

const toggleHint = (key) => {
  if (view.hidden.length === 0) return 'tap to isolate'
  const visible = LEGEND_KEYS.filter((entry) => !view.hidden.includes(entry))
  if (visible.length === 1 && visible[0] === key) return 'tap to show all'
  return view.hidden.includes(key) ? 'tap to show' : 'tap to hide'
}

const pointTally = (metric, key) => {
  const raw = scrubSample.value[key] ?? 0
  const arrow = flowIconFor(metric, raw)
  return {
    direction: directionFor(metric, raw),
    icon: arrow ?? iconFor(metric, scrubSample.value),
    isArrow: Boolean(arrow),
    iconColor: arrow ? flowAccentFor(metric, raw) : accentFor(metric, raw),
    value: metric.format(raw),
    unit: metric.unit,
    color: accentFor(metric, raw)
  }
}

const windowTally = (metric, key) => {
  if (key === 'batterySoc') {
    const delta = windowStats.value.socDelta
    if (delta === null) return emptyTally(metric)
    const color = categoryAccentFor(metric, state.batterySoc ?? 0)
    return {
      direction: '',
      icon: iconFor(metric, state),
      isArrow: false,
      iconColor: color,
      value: signedInteger(delta),
      unit: '%',
      color
    }
  }
  const { kwh, avgWatts, hours } = windowStats.value.energy[key]
  if (hours <= 0) return emptyTally(metric)
  const color = categoryAccentFor(metric, avgWatts)
  const balanced = Math.abs(avgWatts) < BALANCED_WATTS
  return {
    direction: balanced ? '' : directionFor(metric, avgWatts),
    icon: iconFor(metric, state),
    isArrow: false,
    iconColor: color,
    value: balanced ? '0.00' : signedKwh(metric, kwh),
    unit: 'kWh',
    color
  }
}

const emptyTally = (metric) => ({
  direction: '',
  icon: iconFor(metric, state),
  isArrow: false,
  iconColor: themeColors.idle,
  value: '—',
  unit: '',
  color: themeColors.idle
})

const showing = (key) => !view.hidden.includes(key)
const activePowerKeys = computed(() => POWER_KEYS.filter(showing))

const range = computed(() => rangeFor(view.range))
const windowEnd = computed(() => panEnd.value == null ? now.value : panEnd.value)
const windowStart = computed(() => windowEnd.value - range.value.ms)

const atLive = computed(() => panEnd.value == null)
const canStepEarlier = computed(() =>
  firstT.value != null && windowEnd.value - range.value.ms > firstT.value)
const atEarliest = computed(() => !canStepEarlier.value)
const showPan = computed(() => !atLive.value || canStepEarlier.value)

const stepEarlier = () => {
  if (!canStepEarlier.value) return
  panDir = -1
  snappedOnce = false
  const target = windowEnd.value - range.value.ms
  panEnd.value = firstT.value == null ? target : Math.max(target, firstT.value + range.value.ms)
}
const stepLater = () => {
  if (atLive.value) return
  const target = panEnd.value + range.value.ms
  const reachesLiveWindow = target > now.value - range.value.ms
  if (reachesLiveWindow) return goLive()
  panDir = 1
  snappedOnce = false
  panEnd.value = target
}
const goLive = () => { panEnd.value = null; panDir = 0 }

watchEffect(() => {
  if (panEnd.value == null) return
  if (firstT.value != null && panEnd.value - range.value.ms < firstT.value) {
    panEnd.value = firstT.value + range.value.ms
  }
  if (panEnd.value >= now.value) panEnd.value = null
})

const everyMs = computed(() => Math.max(pollMs.value, Math.round(range.value.ms / POINT_BUDGET)))
const liveOldestT = computed(() => samples.value.length ? samples.value[0].t : null)
const useWindowFetch = computed(() =>
  liveOldestT.value != null && windowStart.value < liveOldestT.value)
const fetchSince = computed(() => Math.floor(windowStart.value / everyMs.value) * everyMs.value)
const fetchUntil = computed(() => Math.ceil(windowEnd.value / everyMs.value) * everyMs.value)
const fetchKey = computed(() =>
  useWindowFetch.value ? `${fetchSince.value}|${fetchUntil.value}|${everyMs.value}` : '')

const chartSource = computed(() => useWindowFetch.value ? windowSamples.value : samples.value)
const windowReady = computed(() =>
  !useWindowFetch.value || windowSamplesKey.value === fetchKey.value)
const visible = computed(() => sliceWindow(chartSource.value))
const ready = computed(() =>
  size.value.width > 0 && size.value.height > 0 && visible.value.length > 1)
const windowLabel = computed(() => formatSpan(windowStart.value, windowEnd.value))
const emptyMessage = computed(() => {
  if (snapping.value) return 'No readings in this window, jumping to the nearest…'
  if (!windowReady.value) return 'Loading…'
  if (panEnd.value != null) return 'No readings in this window'
  return 'Collecting history…'
})

const loadWindow = async () => {
  if (!useWindowFetch.value) { windowSamples.value = []; windowSamplesKey.value = ''; return }
  const token = ++windowToken
  const key = fetchKey.value
  try {
    const rows = await fetchWindow(fetchSince.value, fetchUntil.value, everyMs.value)
    if (token !== windowToken || !Array.isArray(rows)) return
    windowSamples.value = rows
    windowSamplesKey.value = key
  } catch {}
}

const snapToNearest = async () => {
  snappedOnce = true
  snapping.value = true
  const dir = panDir
  const from = dir < 0 ? windowStart.value : windowEnd.value
  const sample = await fetchNearest(dir < 0 ? { before: from } : { after: from })
  if (panDir !== dir || (dir < 0 ? windowStart.value : windowEnd.value) !== from) return
  if (sample == null) {
    snapping.value = false
    if (dir > 0) panEnd.value = null
    return
  }
  panEnd.value = dir < 0 ? sample.t : sample.t + range.value.ms
}

const fetchNearest = async ({ before = null, after = null }) => {
  const query = before != null ? `before=${before}` : `after=${after}`
  try {
    const sample = await (await fetch(`/api/history/nearest?${query}`)).json()
    return sample && Number.isFinite(sample.t) ? sample : null
  } catch {
    return null
  }
}

const fetchWindow = async (since, until, every) => {
  const seconds = Math.max(1, Math.round(every / 1000))
  return (await fetch(`/api/history?since=${since}&until=${until}&every=${seconds}`)).json()
}

const loadStats = async () => {
  try {
    const stats = await (await fetch('/api/history/stats')).json()
    if (stats && Number.isFinite(stats.firstT)) historyStats.value = stats
  } catch {}
}

watch(fetchKey, () => loadWindow(), { immediate: true })

const integrationGapMs = computed(() => Math.max(INTEGRATION_GAP_MS, everyMs.value * 3))

const windowStats = computed(() => {
  const list = visible.value
  const energy = {}
  for (const key of POWER_KEYS) energy[key] = integrate(list, key, integrationGapMs.value)
  return { energy, socDelta: socChange(list) }
})

const inner = computed(() => ({
  width: Math.max(0, size.value.width - PAD.left - PAD.right),
  height: Math.max(0, size.value.height - PAD.top - PAD.bottom)
}))

const domain = computed(() => {
  let min = 0
  let max = 0
  for (const sample of visible.value) {
    for (const key of activePowerKeys.value) {
      if (sample[key] < min) min = sample[key]
      if (sample[key] > max) max = sample[key]
    }
  }
  const pad = (max - min) * 0.1 || 500
  return { min: min < 0 ? min - pad : 0, max: max + pad }
})

const x = (t) => PAD.left + ((t - windowStart.value) / range.value.ms) * inner.value.width
const yPower = (watts) => {
  const { min, max } = domain.value
  return PAD.top + (1 - (watts - min) / (max - min)) * inner.value.height
}
const ySoc = (percent) => PAD.top + (1 - percent / 100) * inner.value.height

const zeroY = computed(() => yPower(0))
const baselineY = computed(() => PAD.top + inner.value.height)
const rightEdge = computed(() => PAD.left + inner.value.width)

const strokeWidth = computed(() => (range.value.ms >= THIN_LINE_RANGE_MS ? 1 : 1.75))

let touchScrubbing = false

const scrubTo = (clientX) => {
  const rect = stage.value.getBoundingClientRect()
  const fraction = (clientX - rect.left - PAD.left) / (inner.value.width || 1)
  scrubT.value = windowStart.value + Math.min(1, Math.max(0, fraction)) * range.value.ms
}

const clearScrub = () => { scrubT.value = null }

const onPointerDown = (event) => {
  if (event.pointerType === 'mouse') return
  touchScrubbing = true
  stage.value.setPointerCapture(event.pointerId)
  scrubTo(event.clientX)
}

const onPointerMove = (event) => {
  if (event.pointerType === 'mouse' || touchScrubbing) scrubTo(event.clientX)
}

const onPointerEnd = (event) => {
  if (event.pointerType === 'mouse') return
  touchScrubbing = false
  clearScrub()
}

const onPointerLeave = (event) => {
  if (event.pointerType === 'mouse') clearScrub()
}

const scrubSample = computed(() => {
  if (scrubT.value === null || !visible.value.length) return null
  return nearestSample(visible.value, scrubT.value)
})

const sharedScrub = useScrub()
watchEffect(() => { sharedScrub.value = scrubSample.value })

const scrub = computed(() => {
  const sample = scrubSample.value
  if (!sample || !ready.value) return null
  const cx = x(sample.t)
  const dots = activePowerKeys.value
    .filter((key) => Number.isFinite(sample[key]))
    .map((key) => ({
      key,
      cy: yPower(sample[key]),
      color: accentFor(metricByKey(key), sample[key])
    }))
  if (showing('batterySoc') && Number.isFinite(sample.batterySoc)) {
    dots.push({
      key: 'batterySoc',
      cy: ySoc(sample.batterySoc),
      color: accentFor(metricByKey('batterySoc'), sample.batterySoc)
    })
  }
  return { x: cx, dots }
})

const clockLabel = computed(() =>
  tickLabel(scrubSample.value?.t ?? now.value, range.value.ms))

const segmentsFor = (key) => {
  const points = visible.value
    .map((sample) => ({ t: sample.t, v: sample[key] }))
    .filter((point) => Number.isFinite(point.v))
  const segments = splitOnGaps(points).map(downsample)
  const latest = points.at(-1)
  return { segments, latest }
}

const powerSeries = computed(() => activePowerKeys.value.map((key) => {
  const { segments, latest } = segmentsFor(key)
  return {
    key,
    stroke: FLOW_SHADES[key] ? `url(#flow-${key})` : LINE_COLORS[key],
    dotColor: accentFor(metricByKey(key), state[key] ?? 0),
    path: linePath(segments, x, yPower),
    dot: latest ? { cx: x(latest.t), cy: yPower(latest.v) } : null
  }
}))

const socSeries = computed(() => {
  if (!showing('batterySoc')) return null
  const { segments, latest } = segmentsFor('batterySoc')
  return {
    color: LINE_COLORS.batterySoc,
    dotColor: accentFor(metricByKey('batterySoc'), state.batterySoc ?? 0),
    line: linePath(segments, x, ySoc),
    area: areaPath(segments, x, ySoc, baselineY.value),
    dot: latest ? { cx: x(latest.t), cy: ySoc(latest.v) } : null
  }
})

const showSunLabels = computed(() => range.value.ms <= SUN_LABEL_MAX_MS)
const skyDetail = computed(() =>
  Math.min(SKY_MAX_STOPS, Math.max(64, Math.round(range.value.ms / HOUR_MS))))
const sunDetail = computed(() =>
  Math.min(SUN_MAX_STEPS, Math.max(96, Math.round(range.value.ms / HALF_HOUR_MS))))

const skyStops = computed(() => {
  const { outdoorLatitude: latitude, outdoorLongitude: longitude } = state
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return skyGradientStops({
    start: windowStart.value,
    end: windowEnd.value,
    latitude,
    longitude,
    count: skyDetail.value
  })
})

const sunEvents = computed(() => {
  if (!skyStops.value || !showSunLabels.value) return []
  const { outdoorLatitude: latitude, outdoorLongitude: longitude } = state
  return sunCrossings({
    start: windowStart.value,
    end: windowEnd.value,
    latitude,
    longitude,
    count: sunDetail.value
  }).map((crossing) => {
    const label = crossing.type.toUpperCase()
    const half = approxTextWidth(label, SUN_LABEL_FONT) / 2
    const labelX = Math.min(rightEdge.value - half, Math.max(PAD.left + half, x(crossing.t)))
    return {
      t: crossing.t,
      x: x(crossing.t),
      label,
      labelX,
      labelLeft: labelX - half,
      labelRight: labelX + half
    }
  })
})

const flowGradients = computed(() => {
  const span = inner.value.height || 1
  const fraction = Math.min(1, Math.max(0, (zeroY.value - PAD.top) / span))
  return Object.entries(FLOW_SHADES).map(([key, shades]) => ({ key, fraction, ...shades }))
})

const xTicks = computed(() => TICK_FRACTIONS.map((fraction) => {
  const t = windowStart.value + fraction * range.value.ms
  return {
    fraction,
    x: x(t),
    label: tickLabel(t, range.value.ms),
    anchor: fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'
  }
}).filter((tick) => !collidesWithSunLabel(tick)))

const collidesWithSunLabel = (tick) => {
  const width = approxTextWidth(tick.label, TICK_FONT)
  const left = tick.anchor === 'start' ? tick.x : tick.anchor === 'end' ? tick.x - width : tick.x - width / 2
  return sunEvents.value.some((event) =>
    left < event.labelRight + LABEL_GAP && left + width > event.labelLeft - LABEL_GAP)
}

const approxTextWidth = (text, fontSize) => text.length * fontSize * 0.68

const yTicks = computed(() => {
  const { min, max } = domain.value
  const ticks = [
    { y: yPower(max), label: kw(max) },
    { y: zeroY.value, label: '0' }
  ]
  if (min < 0) ticks.push({ y: yPower(min), label: kw(min) })
  return ticks
})

const downsample = (points) => {
  if (points.length <= MAX_POINTS) return points
  const buckets = Math.ceil(MAX_POINTS / 2)
  const first = points[0].t
  const span = points[points.length - 1].t - first || 1
  const grouped = Array.from({ length: buckets }, () => [])
  for (const point of points) {
    const index = Math.min(buckets - 1, Math.floor(((point.t - first) / span) * buckets))
    grouped[index].push(point)
  }
  return grouped.flatMap(bucketExtremes)
}

const bucketExtremes = (bucket) => {
  if (!bucket.length) return []
  const low = bucket.reduce((min, point) => (point.v < min.v ? point : min))
  const high = bucket.reduce((max, point) => (point.v > max.v ? point : max))
  if (low === high) return [low]
  return low.t <= high.t ? [low, high] : [high, low]
}

const firstIndexAtOrAfter = (points, t) => {
  let low = 0
  let high = points.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (points[mid].t < t) low = mid + 1
    else high = mid
  }
  return low
}

const sliceWindow = (list) => {
  const low = Math.max(0, firstIndexAtOrAfter(list, windowStart.value) - 1)
  const high = Math.min(list.length, firstIndexAtOrAfter(list, windowEnd.value) + 1)
  return list.slice(low, high)
}

const clockOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const dayMonthOf = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })

const dayOf = (t) => new Date(t).toLocaleDateString([], { day: 'numeric' })

const onSameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

const inSameMonth = (a, b) => {
  const from = new Date(a)
  const to = new Date(b)
  return from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()
}

const formatSpan = (start, end) => {
  if (onSameDay(start, end)) return `${dayMonthOf(start)} ${clockOf(start)}–${clockOf(end)}`
  if (clockOf(start) !== clockOf(end)) {
    return `${dayMonthOf(start)} ${clockOf(start)}–${dayMonthOf(end)} ${clockOf(end)}`
  }
  if (inSameMonth(start, end)) return `${dayOf(start)}–${dayMonthOf(end)}`
  return `${dayMonthOf(start)}–${dayMonthOf(end)}`
}

const nearestSample = (points, t) => {
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (points[mid].t < t) low = mid
    else high = mid
  }
  return t - points[low].t <= points[high].t - t ? points[low] : points[high]
}

const splitOnGaps = (points) => {
  const deltas = points.slice(1).map((point, index) => point.t - points[index].t)
  const segments = []
  let current = []
  for (let index = 0; index < points.length; index++) {
    if (index > 0 && isGap(deltas, index - 1)) {
      segments.push(current)
      current = []
    }
    current.push(points[index])
  }
  segments.push(current)
  return segments.filter((segment) => segment.length > 1)
}

const isGap = (deltas, index) => {
  const delta = deltas[index]
  if (delta <= MIN_GAP_MS) return false
  const neighbor = Math.max(deltas[index - 1] ?? 0, deltas[index + 1] ?? 0)
  return delta > neighbor * GAP_FACTOR
}

const linePath = (segments, toX, toY) => segments
  .map((segment) => `M${segment.map((point) => `${toX(point.t).toFixed(1)},${toY(point.v).toFixed(1)}`).join('L')}`)
  .join(' ')

const areaPath = (segments, toX, toY, base) => segments
  .map((segment) => {
    const line = segment.map((point) => `${toX(point.t).toFixed(1)},${toY(point.v).toFixed(1)}`).join('L')
    const firstX = toX(segment[0].t).toFixed(1)
    const lastX = toX(segment.at(-1).t).toFixed(1)
    return `M${line}L${lastX},${base.toFixed(1)}L${firstX},${base.toFixed(1)}Z`
  })
  .join(' ')

const tickLabel = (t, rangeMs) => {
  const at = new Date(t)
  if (rangeMs <= FIVE_MIN_MS) return at.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
  if (rangeMs <= DAY_MS) return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (rangeMs <= WEEK_MS) return at.toLocaleString([], { weekday: 'short', hour: 'numeric' })
  return at.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

const kw = (watts) => formatPower(watts, { signed: true })

const integrate = (samples, key, gapMs = INTEGRATION_GAP_MS) => {
  let kwh = 0
  let hours = 0
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]
    const current = samples[index]
    const elapsed = current.t - previous.t
    if (elapsed <= 0 || elapsed > gapMs) continue
    if (!Number.isFinite(previous[key]) || !Number.isFinite(current[key])) continue
    const span = elapsed / 3600000
    kwh += ((previous[key] + current[key]) / 2 / 1000) * span
    hours += span
  }
  return { kwh, avgWatts: hours > 0 ? (kwh / hours) * 1000 : 0, hours }
}

const socChange = (samples) => {
  const points = samples.filter((sample) => Number.isFinite(sample.batterySoc))
  if (points.length < 2) return null
  return Math.round(points.at(-1).batterySoc) - Math.round(points[0].batterySoc)
}

const signedKwh = (metric, kwh) =>
  metric.directionFor ? signedFixed(kwh, 2) : Math.max(0, kwh).toFixed(2)

const signedFixed = (value, digits) => {
  const rounded = Number(value.toFixed(digits))
  if (rounded === 0) return (0).toFixed(digits)
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(digits)}`
}

const signedInteger = (value) => (value > 0 ? `+${value}` : `${value}`)

const POWER_KEYS = ['pvPower', 'loadPower', 'gridPower', 'batteryPower']

const LEGEND_KEYS = ['batterySoc', 'batteryPower', 'loadPower', 'pvPower', 'gridPower']

const LINE_COLORS = {
  get pvPower() { return themeColors.solarAccent },
  get loadPower() { return themeColors.home },
  get batterySoc() { return themeColors.socHigh }
}

const SUN_EVENT_COLOR = '#fb923c'

const SUN_LABEL_FONT = 8

const TICK_FONT = 10

const LABEL_GAP = 8

const PAD = { top: 10, right: 16, bottom: 24, left: 36 }

const TICK_FRACTIONS = [0, 1 / 3, 2 / 3, 1]

const MAX_POINTS = 600

const MIN_GAP_MS = 15000

const GAP_FACTOR = 4

const TICK_MS = 1000

const THIN_LINE_RANGE_MS = 21600000

const INTEGRATION_GAP_MS = 900000

const BALANCED_WATTS = 50

const POLL_FALLBACK_MS = 5000

const MIN_RANGE_POINTS = 8

const POINT_BUDGET = 1500

const FIVE_MIN_MS = 300000

const HALF_HOUR_MS = 1800000

const HOUR_MS = 3600000

const DAY_MS = 86400000

const WEEK_MS = 604800000

const SUN_LABEL_MAX_MS = 86400000

const SKY_MAX_STOPS = 384

const SUN_MAX_STEPS = 512

const STATS_INTERVAL_MS = 60000

watch([() => visible.value.length, windowReady, () => panEnd.value], () => {
  if (panEnd.value == null || panDir === 0) { snapping.value = false; return }
  if (!windowReady.value) return
  if (visible.value.length > 0 || snappedOnce) { snapping.value = false; return }
  snapToNearest()
})
</script>

<template>
  <section class="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800 sm:p-5">
    <div
      ref="header"
      class="flex flex-wrap items-center gap-x-4 gap-y-2"
      :class="headerWrapped ? 'justify-center' : 'justify-between'"
    >
      <div
        ref="legendGroup"
        class="flex flex-wrap items-center gap-x-4 gap-y-1"
        :class="{ 'justify-center': headerWrapped }"
      >
        <span
          class="flex items-center gap-1.5 tabular-nums transition-colors"
          :class="scrubSample ? 'text-zinc-100' : 'text-zinc-500'"
          :title="scrubSample
            ? 'Values at this point in time'
            : `Totals across the last ${range.label}; hover or drag the chart to read a point`"
        >
          <Clock v-if="scrubSample" class="h-4 w-4" />
          <span class="text-sm font-semibold leading-none">
            {{ scrubSample ? clockLabel : `${range.label} totals` }}
          </span>
        </span>
        <button
          v-for="item in legend"
          :key="item.key"
          class="flex items-center gap-1.5 tabular-nums transition-opacity"
          :class="{ 'opacity-30': item.hidden }"
          :title="`${item.title}, ${item.toggle}`"
          :aria-pressed="!item.hidden"
          @click="toggleMetric(item.key)"
        >
          <component
            :is="item.icon"
            class="h-4 w-4"
            :stroke-width="item.isArrow ? 2.5 : 2"
            :style="{ color: item.iconColor }"
          />
          <span class="text-sm font-semibold leading-none" :style="{ color: item.color }">{{ item.value }}</span>
          <span class="text-xs leading-none text-zinc-500">{{ item.unit }}</span>
        </button>
      </div>
      <div ref="pillsGroup" class="flex items-center gap-1" role="radiogroup" aria-label="Trends range">
        <button
          v-for="option in pills"
          :key="option.key"
          class="rounded-full px-2.5 py-1 text-xs tabular-nums transition"
          :class="option.key === view.range
            ? 'bg-zinc-800 text-zinc-100 ring-1 ring-zinc-600'
            : rangeDisabled(option)
              ? 'cursor-not-allowed text-zinc-700'
              : 'text-zinc-500 hover:text-zinc-300'"
          role="radio"
          :aria-checked="option.key === view.range"
          :aria-disabled="rangeDisabled(option)"
          :title="rangeDisabled(option)
            ? `Unavailable at the current polling rate; tap for details`
            : `Show the last ${option.label}`"
          @click="pickRange(option)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div
      ref="stage"
      class="relative min-h-0 flex-1 touch-none select-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @pointerleave="onPointerLeave"
    >
      <svg v-if="ready" :width="size.width" :height="size.height" class="absolute inset-0">
        <defs>
          <clipPath id="trends-plot">
            <rect :x="PAD.left" y="0" :width="inner.width + PAD.right" :height="size.height" />
          </clipPath>
          <template v-if="skyStops">
            <linearGradient
              id="sky-tint"
              gradientUnits="userSpaceOnUse"
              :x1="PAD.left" :y1="0" :x2="rightEdge" :y2="0"
            >
              <stop
                v-for="stop in skyStops"
                :key="stop.offset"
                :offset="stop.offset"
                :stop-color="stop.color"
                :stop-opacity="stop.opacity"
              />
            </linearGradient>
            <linearGradient id="sky-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity="1" />
              <stop offset="1" stop-color="#fff" stop-opacity="0.15" />
            </linearGradient>
            <mask id="sky-mask">
              <rect
                :x="PAD.left" :y="PAD.top"
                :width="inner.width" :height="inner.height"
                fill="url(#sky-fade)"
              />
            </mask>
          </template>
          <linearGradient
            v-for="gradient in flowGradients"
            :id="`flow-${gradient.key}`"
            :key="gradient.key"
            gradientUnits="userSpaceOnUse"
            :x1="0" :y1="PAD.top" :x2="0" :y2="baselineY"
          >
            <stop offset="0" :stop-color="gradient.positive" />
            <stop :offset="gradient.fraction" :stop-color="gradient.positive" />
            <stop :offset="gradient.fraction" :stop-color="gradient.negative" />
            <stop offset="1" :stop-color="gradient.negative" />
          </linearGradient>
        </defs>
        <rect
          v-if="skyStops"
          :x="PAD.left" :y="PAD.top"
          :width="inner.width" :height="inner.height"
          fill="url(#sky-tint)" mask="url(#sky-mask)"
        />
        <g v-if="socSeries" clip-path="url(#trends-plot)">
          <path :d="socSeries.area" :fill="socSeries.color" fill-opacity="0.08" />
          <path :d="socSeries.line" :stroke="socSeries.color" stroke-opacity="0.35" stroke-width="1.5" fill="none" />
        </g>
        <line
          :x1="PAD.left" :x2="rightEdge" :y1="zeroY" :y2="zeroY"
          stroke="#3f3f46" stroke-dasharray="4 4" stroke-width="1"
        />
        <g clip-path="url(#trends-plot)">
          <path
            v-for="series in powerSeries"
            :key="series.key"
            :d="series.path"
            :stroke="series.stroke"
            :stroke-width="strokeWidth"
            stroke-linejoin="round"
            stroke-linecap="round"
            fill="none"
          />
          <circle
            v-if="socSeries?.dot"
            :cx="socSeries.dot.cx" :cy="socSeries.dot.cy" r="2.5"
            :fill="socSeries.dotColor" fill-opacity="0.5"
          />
          <circle
            v-for="series in powerSeries.filter((entry) => entry.dot)"
            :key="`dot-${series.key}`"
            :cx="series.dot.cx" :cy="series.dot.cy" r="3"
            :fill="series.dotColor"
          />
          <template v-if="scrub">
            <line
              :x1="scrub.x" :x2="scrub.x" :y1="PAD.top" :y2="baselineY"
              stroke="#f4f4f5" stroke-opacity="0.5" stroke-width="1"
            />
            <circle
              v-for="dot in scrub.dots"
              :key="`scrub-${dot.key}`"
              :cx="scrub.x" :cy="dot.cy" r="3"
              :fill="dot.color"
            />
          </template>
        </g>
        <text
          v-for="tick in yTicks"
          :key="`y-${tick.label}`"
          :x="PAD.left - 8" :y="tick.y + 3"
          text-anchor="end" class="fill-zinc-600 text-[10px] tabular-nums"
        >
          {{ tick.label }}
        </text>
        <text
          v-for="tick in xTicks"
          :key="`x-${tick.fraction}`"
          :x="tick.x" :y="baselineY + 16"
          :text-anchor="tick.anchor" class="fill-zinc-600 text-[10px] tabular-nums"
        >
          {{ tick.label }}
        </text>
        <text
          v-for="event in sunEvents"
          :key="`sun-label-${event.t}`"
          :x="event.labelX" :y="baselineY + 16"
          text-anchor="middle" class="text-[8px] tracking-wider"
          :fill="SUN_EVENT_COLOR" fill-opacity="0.8"
        >
          {{ event.label }}
        </text>
      </svg>
      <p
        v-if="size.width > 0 && visible.length < 2"
        class="absolute inset-0 flex items-center justify-center text-sm text-zinc-500"
      >
        {{ emptyMessage }}
      </p>
    </div>

    <div v-if="showPan" class="grid grid-cols-[1fr_auto_1fr] items-center text-xs text-zinc-500">
      <div class="col-start-2 flex min-w-0 items-center justify-center gap-2">
        <button
          class="rounded-full p-3 -m-2 transition duration-200"
          :class="atEarliest ? 'cursor-not-allowed opacity-30' : 'hover:text-zinc-200'"
          :disabled="atEarliest"
          title="Earlier"
          aria-label="Earlier"
          @click="stepEarlier"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <span class="flex min-w-0 items-center gap-1.5">
          <History v-if="!atLive" class="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span v-else class="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
          <span
            class="truncate tabular-nums font-medium"
            :class="atLive ? 'text-green-500' : 'text-amber-300'"
          >{{ windowLabel }}</span>
        </span>
        <button
          class="rounded-full p-3 -m-2 transition duration-200"
          :class="atLive ? 'cursor-not-allowed opacity-30' : 'hover:text-zinc-200'"
          :disabled="atLive"
          title="Later"
          aria-label="Later"
          @click="stepLater"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
      <button
        v-if="!atLive"
        class="col-start-3 flex items-center gap-1 justify-self-end rounded-full px-1.5 py-0.5 font-medium text-green-500 transition duration-200 hover:text-green-300"
        title="Back to live"
        @click="goLive"
      >
        <ChevronLast class="h-4 w-4" />
        Live
      </button>
    </div>

    <div
      v-if="rangeNotice"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-6"
      role="dialog"
      aria-modal="true"
      @click="dismissRangeNotice"
    >
      <div class="max-w-sm rounded-2xl bg-zinc-900 p-5 text-sm text-zinc-300 ring-1 ring-zinc-700" @click.stop>
        <p class="font-semibold text-zinc-100">{{ rangeNotice.label }} range unavailable</p>
        <p class="mt-2">
          The gateway is currently polled every {{ rangeNotice.interval }}, so a
          {{ rangeNotice.label }} window would hold too few readings to draw a trend.
          It needs a reading at least every {{ rangeNotice.needed }} and will come back
          when the polling schedule speeds up.
        </p>
        <button
          class="mt-4 rounded-full bg-zinc-800 px-4 py-1.5 text-zinc-100 ring-1 ring-zinc-600"
          @click="dismissRangeNotice"
        >
          OK
        </button>
      </div>
    </div>
  </section>
</template>
