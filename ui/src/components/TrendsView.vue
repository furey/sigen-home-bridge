<script setup>
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useStateStream } from '../composables/useStateStream.js'
import { useHistory } from '../composables/useHistory.js'
import { TREND_MODES, TREND_RANGES, rangeFor, useDashboardView } from '../composables/useDashboardView.js'
import { calendarLabel, calendarTicks, calendarWindow, dayBounds } from '../lib/trendWindow.js'
import { ChartLine, ChevronLast, ChevronLeft, ChevronRight, Clock, History, Rows3 } from '@lucide/vue'
import { useHoverCapable } from '../composables/useHoverCapable.js'
import { useScrub } from '../composables/useScrub.js'
import { useSettings } from '../composables/useSettings.js'
import {
  FLOW_SHADES, SMART_PORT_DIM, accentFor, categoryAccentFor, directionFor, flowAccentFor,
  flowIconFor, formatPower, iconFor, lerpHex, metricByKey
} from '../lib/metrics.js'
import { themeColors } from '../lib/theme.js'
import { skyGradientStops, sunCrossings } from '../lib/sun.js'

const { state } = useStateStream()
const { samples } = useHistory()
const { view, setRange, setMode, setLayout, toggleMetric } = useDashboardView()
const { data: settings } = useSettings()
const hoverCapable = useHoverCapable()

const smartPortActive = computed(() =>
  Boolean(settings.smartLoads?.showOnDashboard) &&
  state.devices.some((device) => device.type === 'smartLoad'))
const powerKeys = computed(() => (smartPortActive.value ? withSmartPort(POWER_KEYS) : POWER_KEYS))
const legendKeys = computed(() => (smartPortActive.value ? withSmartPort(LEGEND_KEYS) : LEGEND_KEYS))

const stage = ref(null)
const size = ref({ width: 0, height: 0 })
const now = ref(Date.now())
const scrubT = ref(null)
const panEnd = ref(null)
const offset = ref(0)
const anchor = ref(null)
const historyStats = ref(null)
const windowSamples = ref([])
const windowSamplesKey = ref('')
const periods = ref([])
const periodsKey = ref('')
const snapping = ref(false)

let resizeObserver = null
let ticker = null
let statsTicker = null
let windowToken = 0
let periodsToken = 0
let panDir = 0
let snappedOnce = false

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  resizeObserver.observe(stage.value)
  ticker = setInterval(() => { now.value = Date.now() }, TICK_MS)
  statsTicker = setInterval(() => {
    loadStats()
    if (barMode.value && (atLive.value || !periodsReady.value)) loadPeriods()
  }, STATS_INTERVAL_MS)
  loadStats()
  document.addEventListener('visibilitychange', onVisibility)
  if (hoverCapable.value) window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
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
  loadPeriods()
}

const pollMs = computed(() => state.pollIntervalMs ?? POLL_FALLBACK_MS)
const firstT = computed(() => historyStats.value?.firstT ?? null)
const isLive = computed(() => view.mode === 'live')
const rangeDisabled = (option) => option.ms < pollMs.value * MIN_RANGE_POINTS
const enabledRanges = computed(() => TREND_RANGES.filter((option) => !rangeDisabled(option)))

const zoomSteps = computed(() => [
  ...enabledRanges.value.map((option) => ({ mode: 'live', range: option.key })),
  ...CALENDAR_MODES.map((mode) => ({ mode }))
])

const stepZoom = (delta) => {
  const steps = zoomSteps.value
  const index = steps.findIndex((step) =>
    step.mode === view.mode && (!isLive.value || step.range === view.range)) + delta
  if (index < 0 || index >= steps.length) return
  pickMode(steps[index].mode)
  if (steps[index].range) setRange(steps[index].range)
}

const pickMode = (key) => {
  if (key === view.mode) return
  offset.value = 0
  goLive()
  setMode(key)
}

watchEffect(() => {
  if (!isLive.value || !rangeDisabled(rangeFor(view.range))) return
  const current = rangeFor(view.range)
  const replacement = enabledRanges.value.find((option) => option.ms > current.ms)
  if (replacement) return setRange(replacement.key)
  pickMode('day')
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

const legend = computed(() => legendKeys.value.map((key) => {
  const metric = metricByKey(key)
  const tally = scrubPeriod.value
    ? periodTally(metric, key)
    : scrubSample.value && !barMode.value ? pointTally(metric, key) : windowTally(metric, key)
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
  const visible = legendKeys.value.filter((entry) => !view.hidden.includes(entry))
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

const periodTally = (metric, key) => {
  if (key === 'batterySoc') {
    const { socStart, socEnd } = scrubPeriod.value
    if (socStart == null) return emptyTally(metric)
    const color = categoryAccentFor(metric, socEnd)
    return { direction: '', icon: iconFor(metric, state), isArrow: false, iconColor: color, value: `${Math.round(socEnd)}`, unit: '%', color }
  }
  const kwh = netKwh(scrubPeriod.value, key)
  if (!hasEnergy(scrubPeriod.value, key)) return emptyTally(metric)
  const color = categoryAccentFor(metric, kwh * 1000)
  const balanced = Math.abs(kwh * 1000) < BALANCED_WATTS
  return {
    direction: balanced ? '' : directionFor(metric, kwh * 1000),
    icon: iconFor(metric, state),
    isArrow: false,
    iconColor: color,
    value: balanced ? '0.00' : signedKwh(metric, kwh),
    unit: 'kWh',
    color
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
const activePowerKeys = computed(() => powerKeys.value.filter(showing))

const range = computed(() => rangeFor(view.range))
const today = computed(() => calendarWindow({ mode: 'day', now: now.value }).start)
const periodNow = computed(() => (offset.value === 0 ? today.value : anchor.value ?? today.value))
const calendar = computed(() =>
  isLive.value ? null : calendarWindow({ mode: view.mode, offset: offset.value, now: periodNow.value }))
const windowEnd = computed(() => {
  if (calendar.value) return calendar.value.end
  return panEnd.value == null ? now.value : panEnd.value
})
const windowStart = computed(() => calendar.value?.start ?? windowEnd.value - range.value.ms)
const spanMs = computed(() => windowEnd.value - windowStart.value)
const barMode = computed(() => view.mode === 'week' || view.mode === 'month')
const lanesMode = computed(() => view.layout === 'lanes')
const stageHeightClass = computed(() => (lanesMode.value
  ? 'max-sm:min-h-[100vw]'
  : 'max-sm:max-h-[100vw] max-sm:min-h-[72vw]'))
const bounds = computed(() => (barMode.value ? dayBounds(calendar.value) : []))
const boundsKey = computed(() => bounds.value.join(','))
const periodsReady = computed(() => !barMode.value || periodsKey.value === boundsKey.value)

const loadPeriods = async () => {
  if (!barMode.value) return
  const key = boundsKey.value
  const token = ++periodsToken
  try {
    const rows = await (await fetch(`/api/history/energy?bounds=${key}`)).json()
    if (token !== periodsToken || key !== boundsKey.value || !Array.isArray(rows)) return
    periods.value = rows
    periodsKey.value = key
  } catch {}
}

const atLive = computed(() => (isLive.value ? panEnd.value == null : offset.value === 0))
const canStepEarlier = computed(() =>
  firstT.value != null && windowStart.value > firstT.value)
const atEarliest = computed(() => !canStepEarlier.value)
const showPan = computed(() => isLive.value && (!atLive.value || canStepEarlier.value))

const stepEarlier = () => {
  if (!canStepEarlier.value) return
  if (!isLive.value) {
    if (offset.value === 0) anchor.value = today.value
    offset.value += 1
    return
  }
  panDir = -1
  snappedOnce = false
  const target = windowEnd.value - range.value.ms
  panEnd.value = firstT.value == null ? target : Math.max(target, firstT.value + range.value.ms)
}
const stepLater = () => {
  if (atLive.value) return
  if (!isLive.value) { offset.value -= 1; return }
  const target = panEnd.value + range.value.ms
  const reachesLiveWindow = target > now.value - range.value.ms
  if (reachesLiveWindow) return goLive()
  panDir = 1
  snappedOnce = false
  panEnd.value = target
}
const goLive = () => { panEnd.value = null; panDir = 0; offset.value = 0 }

watchEffect(() => {
  if (panEnd.value == null) return
  if (firstT.value != null && panEnd.value - range.value.ms < firstT.value) {
    panEnd.value = firstT.value + range.value.ms
  }
  if (panEnd.value >= now.value) panEnd.value = null
})

const everyMs = computed(() => Math.max(pollMs.value, Math.round(spanMs.value / POINT_BUDGET)))
const liveOldestT = computed(() => samples.value.length ? samples.value[0].t : null)
const useWindowFetch = computed(() =>
  !barMode.value && liveOldestT.value != null && windowStart.value < liveOldestT.value)
const fetchSince = computed(() => Math.floor(windowStart.value / everyMs.value) * everyMs.value)
const fetchUntil = computed(() =>
  Math.ceil(Math.min(windowEnd.value, now.value) / everyMs.value) * everyMs.value)
const fetchKey = computed(() =>
  useWindowFetch.value ? `${fetchSince.value}|${fetchUntil.value}|${everyMs.value}` : '')

const chartSource = computed(() => useWindowFetch.value ? windowSamples.value : samples.value)
const windowReady = computed(() =>
  !useWindowFetch.value || windowSamplesKey.value === fetchKey.value)
const visible = computed(() => sliceWindow(chartSource.value))
const ready = computed(() =>
  size.value.width > 0 && size.value.height > 0 && (barMode.value || visible.value.length > 1))
const windowLabel = computed(() => (calendar.value
  ? calendarLabel({ mode: view.mode, offset: offset.value, ...calendar.value })
  : formatSpan(windowStart.value, windowEnd.value)))
const totalsLabel = computed(() => (isLive.value ? `${range.value.label} totals` : TOTALS_LABELS[view.mode]))
const hasChartData = computed(() => (barMode.value
  ? periodsReady.value && periods.value.some((period) => activePowerKeys.value.some((key) => hasEnergy(period, key)))
  : visible.value.length > 1))
const emptyMessage = computed(() => {
  if (barMode.value && !periodsReady.value) return 'Loading…'
  if (snapping.value) return 'No readings in this window, jumping to the nearest…'
  if (!windowReady.value) return 'Loading…'
  if (!atLive.value) return 'No readings in this window'
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

const windowStats = computed(() => (barMode.value ? periodStats.value : sampleStats.value))

const periodStats = computed(() => {
  const list = periodsReady.value ? periods.value : []
  const energy = {}
  for (const key of powerKeys.value) energy[key] = periodEnergy(list, key)
  const socs = list.filter((period) => period.socStart != null)
  const socDelta = socs.length
    ? Math.round(socs.at(-1).socEnd) - Math.round(socs[0].socStart)
    : null
  return { energy, socDelta }
})

const periodEnergy = (list, key) => {
  const kwh = list.reduce((total, period) => total + netKwh(period, key), 0)
  const hours = list.some((period) => hasEnergy(period, key)) ? 1 : 0
  return { kwh, avgWatts: kwh * 1000, hours }
}

const netKwh = (period, key) => (period.energy[key]?.positive ?? 0) + (period.energy[key]?.negative ?? 0)

const hasEnergy = (period, key) => Boolean(period.energy[key]?.positive || period.energy[key]?.negative)

const sampleStats = computed(() => {
  const list = visible.value
  const energy = {}
  for (const key of powerKeys.value) energy[key] = integrate(list, key, integrationGapMs.value)
  return { energy, socDelta: socChange(list) }
})

const inner = computed(() => ({
  width: Math.max(0, size.value.width - PAD.left - PAD.right),
  height: Math.max(0, size.value.height - PAD.top - PAD.bottom)
}))

const domain = computed(() => (barMode.value ? barDomain.value : powerDomain.value))

const barDomain = computed(() => {
  let min = 0
  let max = 0
  for (const period of periodsReady.value ? periods.value : []) {
    for (const key of activePowerKeys.value) {
      max = Math.max(max, period.energy[key]?.positive ?? 0)
      min = Math.min(min, period.energy[key]?.negative ?? 0)
    }
  }
  const pad = (max - min) * 0.1 || 1
  return { min: min < 0 ? min - pad : 0, max: max + pad }
})

const powerDomain = computed(() => {
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

const x = (t) => PAD.left + ((t - windowStart.value) / spanMs.value) * inner.value.width
const yPower = (watts) => {
  const { min, max } = domain.value
  return PAD.top + (1 - (watts - min) / (max - min)) * inner.value.height
}
const ySoc = (percent) => PAD.top + (1 - percent / 100) * inner.value.height

const zeroY = computed(() => yPower(0))
const baselineY = computed(() => PAD.top + inner.value.height)
const rightEdge = computed(() => PAD.left + inner.value.width)

const strokeWidth = computed(() => (spanMs.value >= THIN_LINE_RANGE_MS ? 1 : 1.75))

let touchScrubbing = false

const scrubTo = (clientX) => {
  const rect = stage.value.getBoundingClientRect()
  const fraction = (clientX - rect.left - PAD.left) / (inner.value.width || 1)
  scrubT.value = windowStart.value + Math.min(1, Math.max(0, fraction)) * spanMs.value
}

const clearScrub = () => { scrubT.value = null }

let pressX = null

const openDay = (start) => {
  const days = Math.round((today.value - start) / DAY_MS)
  if (days < 0) return
  pickMode('day')
  anchor.value = today.value
  offset.value = days
}

const onStageClick = (event) => {
  if (!barMode.value || event.pointerType !== 'mouse' || !isTap(event)) return
  if (scrubPeriod.value) openDay(scrubPeriod.value.start)
}

const isTap = (event) => pressX != null && Math.abs(event.clientX - pressX) < TAP_SLOP_PX

const onPointerDown = (event) => {
  pressX = event.clientX
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
  const tapped = event.type === 'pointerup' && isTap(event)
  if (barMode.value && tapped && scrubPeriod.value) openDay(scrubPeriod.value.start)
  pressX = null
  touchScrubbing = false
  clearScrub()
}

const onPointerLeave = (event) => {
  if (event.pointerType === 'mouse') clearScrub()
}

const scrubSample = computed(() => {
  if (barMode.value || scrubT.value === null || !visible.value.length) return null
  return nearestSample(visible.value, scrubT.value)
})

const sharedScrub = useScrub()
watchEffect(() => { sharedScrub.value = scrubSample.value })

const scrub = computed(() => {
  const sample = scrubSample.value
  if (barMode.value || !sample || !ready.value) return null
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

const scrubPeriod = computed(() => {
  if (!barMode.value || scrubT.value === null || !periodsReady.value) return null
  return periods.value.find((period) => scrubT.value >= period.start && scrubT.value < period.end) ?? null
})

const bars = computed(() => {
  if (!barMode.value || !periodsReady.value || !ready.value) return []
  const keys = activePowerKeys.value
  return periods.value.map((period) => {
    const left = x(period.start)
    const width = x(period.end) - left
    const barWidth = Math.max(1, (width * BAR_FILL) / Math.max(1, keys.length))
    const first = left + (width * (1 - BAR_FILL)) / 2
    return {
      start: period.start,
      highlight: scrubPeriod.value === period ? { x: left, width } : null,
      rects: keys.flatMap((key, index) => barRects({ period, key, x: first + index * barWidth, width: barWidth }))
    }
  })
})

const barRects = ({ period, key, x: left, width }) => {
  const { positive = 0, negative = 0 } = period.energy[key] ?? {}
  const zero = zeroY.value
  const gap = width > 3 ? 1 : 0
  const rect = (value, sign) => {
    const y = yPower(value)
    return {
      key: `${key}-${sign}`,
      x: left + gap / 2,
      width: width - gap,
      y: Math.min(y, zero),
      height: Math.abs(zero - y),
      fill: barColor(key, sign)
    }
  }
  return [positive > 0 && rect(positive, 'positive'), negative < 0 && rect(negative, 'negative')].filter(Boolean)
}

const barColor = (key, sign) => FLOW_SHADES[key]?.[sign] ?? LINE_COLORS[key]

const laneKeys = computed(() => [...activePowerKeys.value, ...(showing('batterySoc') ? ['batterySoc'] : [])])

const lanes = computed(() => {
  if (!lanesMode.value || !ready.value) return []
  const keys = laneKeys.value
  const height = (inner.value.height - LANE_GAP * (keys.length - 1)) / Math.max(1, keys.length)
  if (height < LANE_LABEL_HEIGHT + LANE_MIN_PLOT) return []
  return keys.map((key, index) => {
    const top = PAD.top + index * (height + LANE_GAP)
    return barMode.value ? barLane({ key, top, height }) : lineLane({ key, top, height })
  })
})

const laneScrubDots = computed(() => {
  const sample = scrubSample.value
  if (!sample || !lanesMode.value) return []
  return lanes.value
    .filter((lane) => Number.isFinite(sample[lane.key]))
    .map((lane) => ({
      key: lane.key,
      cy: lane.scale(sample[lane.key]),
      color: accentFor(metricByKey(lane.key), sample[lane.key])
    }))
})

const laneHighlight = computed(() => {
  if (!lanesMode.value || !scrubPeriod.value) return null
  const left = x(scrubPeriod.value.start)
  return { x: left, width: x(scrubPeriod.value.end) - left }
})

const laneScale = ({ top, height, min, max }) => (value) =>
  top + (1 - (value - min) / (max - min || 1)) * height

const paddedDomain = (values, fallbackPad) => {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const pad = (max - min) * 0.1 || fallbackPad
  return { min: min < 0 ? min - pad : 0, max: max + pad }
}

const lineLane = ({ key, top: laneTop, height: laneHeight }) => {
  const top = laneTop + LANE_LABEL_HEIGHT
  const height = laneHeight - LANE_LABEL_HEIGHT
  const { segments } = segmentsFor(key)
  const isSoc = key === 'batterySoc'
  const values = segments.flat().map((point) => point.v)
  const domain = isSoc ? { min: 0, max: 100 } : paddedDomain(values, LINE_FALLBACK_PAD)
  const y = laneScale({ top, height, ...domain })
  const zero = y(0)
  return {
    key,
    top,
    height,
    labelY: laneTop + LANE_LABEL_BASELINE,
    label: laneLabel(key, Math.max(0, ...values)),
    scale: y,
    zeroY: isSoc ? null : zero,
    stroke: FLOW_SHADES[key] ? `url(#lane-${key})` : LINE_COLORS[key],
    gradient: FLOW_SHADES[key] ? { ...FLOW_SHADES[key], fraction: Math.min(1, Math.max(0, (zero - top) / height)) } : null,
    path: linePath(segments, x, y),
    area: isSoc ? areaPath(segments, x, y, top + height) : null,
    rects: []
  }
}

const barLane = ({ key, top: laneTop, height: laneHeight }) => {
  const top = laneTop + LANE_LABEL_HEIGHT
  const height = laneHeight - LANE_LABEL_HEIGHT
  const list = periodsReady.value ? periods.value : []
  const isSoc = key === 'batterySoc'
  const values = list.flatMap((period) => (isSoc
    ? [period.socEnd ?? 0]
    : [period.energy[key]?.positive ?? 0, period.energy[key]?.negative ?? 0]))
  const domain = isSoc ? { min: 0, max: 100 } : paddedDomain(values, BAR_FALLBACK_PAD)
  const y = laneScale({ top, height, ...domain })
  const zero = y(0)
  const rects = list.flatMap((period) => {
    const left = x(period.start)
    const width = (x(period.end) - left) * BAR_FILL
    const barX = left + (x(period.end) - left - width) / 2
    const parts = isSoc
      ? [[period.socEnd ?? 0, 'positive']]
      : [[period.energy[key]?.positive ?? 0, 'positive'], [period.energy[key]?.negative ?? 0, 'negative']]
    return parts.filter(([value]) => value !== 0).map(([value, sign]) => ({
      key: `${key}-${period.start}-${sign}`,
      x: barX,
      width,
      y: Math.min(y(value), zero),
      height: Math.abs(zero - y(value)),
      fill: isSoc ? LINE_COLORS.batterySoc : barColor(key, sign)
    }))
  })
  return {
    key,
    top,
    height,
    labelY: laneTop + LANE_LABEL_BASELINE,
    label: laneLabel(key, Math.max(0, ...values)),
    scale: y,
    zeroY: isSoc ? null : zero,
    rects,
    path: '',
    area: null,
    gradient: null
  }
}

const laneLabel = (key, max) => `${metricByKey(key).label} · ${laneMax(key, max)}`

const laneMax = (key, max) => {
  if (key === 'batterySoc') return '100%'
  return barMode.value ? kwhLabel(max) : `${formatPower(max)} kW`
}

const clockLabel = computed(() => {
  if (scrubPeriod.value) return new Date(scrubPeriod.value.start).toLocaleDateString([], PERIOD_SCRUB_FORMAT)
  const t = scrubSample.value?.t ?? now.value
  if (view.mode === 'month') return new Date(t).toLocaleString([], MONTH_SCRUB_FORMAT)
  return tickLabel(t, spanMs.value)
})

const segmentsFor = (key) => {
  const points = visible.value
    .map((sample) => ({ t: sample.t, v: sample[key] }))
    .filter((point) => Number.isFinite(point.v))
  const segments = splitOnGaps(points).map(downsample)
  const latest = points.at(-1)
  return { segments, latest }
}

const powerSeries = computed(() => (barMode.value ? [] : activePowerKeys.value).map((key) => {
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
  if (barMode.value || !showing('batterySoc')) return null
  const { segments, latest } = segmentsFor('batterySoc')
  return {
    color: LINE_COLORS.batterySoc,
    dotColor: accentFor(metricByKey('batterySoc'), state.batterySoc ?? 0),
    line: linePath(segments, x, ySoc),
    area: areaPath(segments, x, ySoc, baselineY.value),
    dot: latest ? { cx: x(latest.t), cy: ySoc(latest.v) } : null
  }
})

const showSunLabels = computed(() => spanMs.value <= SUN_LABEL_MAX_MS)
const skyDetail = computed(() =>
  Math.min(SKY_MAX_STOPS, Math.max(64, Math.round(spanMs.value / HOUR_MS))))
const sunDetail = computed(() =>
  Math.min(SUN_MAX_STEPS, Math.max(96, Math.round(spanMs.value / HALF_HOUR_MS))))

const skyStops = computed(() => {
  if (barMode.value) return null
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

const tickPoints = computed(() => {
  if (calendar.value) return calendarTicks({ mode: view.mode, ...calendar.value })
  return TICK_FRACTIONS.map((fraction) => {
    const t = windowStart.value + fraction * spanMs.value
    return { t, label: tickLabel(t, spanMs.value) }
  })
})

const xTicks = computed(() => tickPoints.value.map(({ t, label }) => {
  const fraction = (t - windowStart.value) / spanMs.value
  return {
    t,
    x: x(t),
    label,
    anchor: fraction <= EDGE_FRACTION ? 'start' : fraction >= 1 - EDGE_FRACTION ? 'end' : 'middle'
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
  const ticks = [{ y: yPower(max) + Y_LABEL_BELOW, label: kw(max) }]
  if (!barMode.value) ticks.push({ y: zeroY.value - Y_LABEL_ABOVE, label: '0' })
  if (min < 0) ticks.push({ y: yPower(min) - Y_LABEL_ABOVE, label: kw(min) })
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
  if (rangeMs <= DAY_MS + HOUR_MS) return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (rangeMs <= WEEK_MS + HOUR_MS) return at.toLocaleString([], { weekday: 'short', hour: 'numeric' })
  return at.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

const kw = (value) => (barMode.value ? kwhLabel(value) : formatPower(value, { signed: true }))

const kwhLabel = (kwh) => `${kwh < 0 ? '-' : ''}${Math.abs(kwh).toFixed(Math.abs(kwh) >= 10 ? 0 : 1)} kWh`

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

const withSmartPort = (keys) =>
  keys.flatMap((key) => (key === 'loadPower' ? [key, 'smartPortPower'] : [key]))

const LINE_COLORS = {
  get pvPower() { return themeColors.solarAccent },
  get loadPower() { return themeColors.home },
  get smartPortPower() { return lerpHex(themeColors.home, '#000000', SMART_PORT_DIM) },
  get batterySoc() { return themeColors.socHigh }
}

const SUN_EVENT_COLOR = '#fb923c'

const SUN_LABEL_FONT = 8

const TICK_FONT = 10

const LABEL_GAP = 8

const PAD = { top: 10, right: 10, bottom: 24, left: 8 }

const Y_LABEL_BELOW = 13

const Y_LABEL_ABOVE = 4

const CALENDAR_MODES = TREND_MODES.filter((mode) => mode.key !== 'live').map((mode) => mode.key)

const TOTALS_LABELS = { day: 'Day totals', week: 'Week totals', month: 'Month totals' }

const BAR_FILL = 0.8

const LANE_GAP = 8

const LANE_LABEL_HEIGHT = 16

const LANE_LABEL_BASELINE = 11

const LANE_MIN_PLOT = 12

const LINE_FALLBACK_PAD = 500

const BAR_FALLBACK_PAD = 1

const LAYOUT_OPTIONS = [
  { key: 'combined', label: 'Combined', icon: ChartLine },
  { key: 'lanes', label: 'Lanes', icon: Rows3 }
]

const TAP_SLOP_PX = 8

const PERIOD_SCRUB_FORMAT = { weekday: 'short', day: 'numeric', month: 'short' }

const MONTH_SCRUB_FORMAT = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }

const TICK_FRACTIONS = [0, 1 / 3, 2 / 3, 1]

const EDGE_FRACTION = 0.02

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

const SUN_LABEL_MAX_MS = 90000000

const SKY_MAX_STOPS = 384

const SUN_MAX_STEPS = 512

const STATS_INTERVAL_MS = 60000

watch(boundsKey, () => loadPeriods(), { immediate: true })

watch([() => visible.value.length, windowReady, () => panEnd.value], () => {
  if (panEnd.value == null || panDir === 0) { snapping.value = false; return }
  if (!windowReady.value) return
  if (visible.value.length > 0 || snappedOnce) { snapping.value = false; return }
  snapToNearest()
})
</script>

<template>
  <section class="trends-section flex flex-col gap-3 rounded-2xl phone-bleed bg-zinc-900 p-4 ring-1 ring-zinc-800 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div
        class="flex w-full gap-0.5 rounded-xl bg-zinc-950/60 p-1 ring-1 ring-zinc-800 sm:w-auto"
        role="group"
        aria-label="Trends period"
      >
        <button
          v-for="mode in TREND_MODES"
          :key="mode.key"
          class="h-9 flex-1 rounded-lg px-4 text-sm font-medium transition sm:flex-none"
          :class="mode.key === view.mode ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'"
          :aria-pressed="mode.key === view.mode"
          @click="pickMode(mode.key)"
        >
          {{ mode.label }}
        </button>
      </div>
      <div v-if="isLive" class="flex items-center gap-1 max-sm:w-full max-sm:justify-center" role="group" aria-label="Range">
        <button
          v-for="option in TREND_RANGES"
          :key="option.key"
          class="h-8 rounded-full px-3 text-xs tabular-nums transition"
          :class="option.key === view.range
            ? 'bg-zinc-100 text-zinc-900'
            : rangeDisabled(option)
              ? 'cursor-not-allowed text-zinc-700'
              : 'text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200'"
          :aria-pressed="option.key === view.range"
          :aria-disabled="rangeDisabled(option)"
          :title="rangeDisabled(option)
            ? `Unavailable at the current polling rate; tap for details`
            : `Show the last ${option.label}`"
          @click="pickRange(option)"
        >
          {{ option.label }}
        </button>
      </div>
      <div v-else class="grid grid-cols-[1fr_auto_1fr] items-center max-sm:w-full sm:w-96">
        <div class="col-start-2 flex items-center gap-1">
          <button
            class="grid h-10 w-10 place-items-center rounded-full transition"
            :class="atEarliest ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-300 hover:text-zinc-100'"
            :disabled="atEarliest"
            aria-label="Earlier"
            title="Earlier"
            @click="stepEarlier"
          >
            <ChevronLeft class="h-5 w-5" />
          </button>
          <span class="w-36 truncate text-center text-sm font-semibold tabular-nums">{{ windowLabel }}</span>
          <button
            class="grid h-10 w-10 place-items-center rounded-full transition"
            :class="atLive ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-300 hover:text-zinc-100'"
            :disabled="atLive"
            aria-label="Later"
            title="Later"
            @click="stepLater"
          >
            <ChevronRight class="h-5 w-5" />
          </button>
        </div>
        <button
          v-if="!atLive"
          class="col-start-3 justify-self-end rounded-full px-3 py-1.5 text-xs font-medium text-zinc-100 ring-1 ring-zinc-700 transition hover:bg-zinc-800"
          @click="goLive"
        >
          Now
        </button>
      </div>
    </div>

    <div class="trends-readout flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <span
          class="flex items-center gap-1.5 tabular-nums transition-colors"
          :class="scrubSample || scrubPeriod ? 'text-zinc-100' : 'trends-readout-idle text-zinc-500'"
          :title="scrubSample || scrubPeriod
            ? 'Values at this point in time'
            : 'Totals across this window; hover or drag the chart to read a point'"
        >
          <Clock v-if="scrubSample || scrubPeriod" class="h-4 w-4" />
          <span class="text-xs font-semibold uppercase tracking-wide leading-none">
            {{ scrubSample || scrubPeriod ? clockLabel : totalsLabel }}
          </span>
        </span>
        <div class="flex gap-0.5 rounded-lg bg-zinc-950/60 p-0.5 ring-1 ring-zinc-800" role="group" aria-label="Chart layout">
          <button
            v-for="option in LAYOUT_OPTIONS"
            :key="option.key"
            class="grid h-9 w-11 place-items-center rounded-md transition"
            :class="view.layout === option.key ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'"
            :aria-pressed="view.layout === option.key"
            :aria-label="option.label"
            :title="option.label"
            @click="setLayout(option.key)"
          >
            <component :is="option.icon" class="h-4 w-4" />
          </button>
        </div>
      </div>
      <div class="trends-legend grid grid-cols-3 gap-x-3 gap-y-2.5 sm:flex sm:flex-wrap sm:gap-x-5">
        <button
          v-for="item in legend"
          :key="item.key"
          class="flex min-w-0 items-center gap-1.5 tabular-nums transition-opacity"
          :class="{ 'opacity-30': item.hidden }"
          :title="`${item.title}, ${item.toggle}`"
          :aria-pressed="!item.hidden"
          @click="toggleMetric(item.key)"
        >
          <component
            :is="item.icon"
            class="h-4 w-4 shrink-0"
            :stroke-width="item.isArrow ? 2.5 : 2"
            :style="{ color: item.iconColor }"
          />
          <span class="text-base font-semibold leading-none" :style="{ color: item.color }">{{ item.value }}</span>
          <span class="text-xs leading-none text-zinc-500">{{ item.unit }}</span>
        </button>
      </div>
    </div>

    <div
      ref="stage"
      class="relative min-h-0 flex-1 touch-none select-none max-sm:-mx-4"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @pointerleave="onPointerLeave"
      @click="onStageClick"
      :class="[stageHeightClass, { 'cursor-pointer': barMode }]"
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
          <linearGradient
            v-for="lane in lanes.filter((entry) => entry.gradient)"
            :id="`lane-${lane.key}`"
            :key="`lane-gradient-${lane.key}`"
            gradientUnits="userSpaceOnUse"
            :x1="0" :y1="lane.top" :x2="0" :y2="lane.top + lane.height"
          >
            <stop offset="0" :stop-color="lane.gradient.positive" />
            <stop :offset="lane.gradient.fraction" :stop-color="lane.gradient.positive" />
            <stop :offset="lane.gradient.fraction" :stop-color="lane.gradient.negative" />
            <stop offset="1" :stop-color="lane.gradient.negative" />
          </linearGradient>
        </defs>
        <rect
          v-if="skyStops"
          :x="PAD.left" :y="PAD.top"
          :width="inner.width" :height="inner.height"
          fill="url(#sky-tint)" mask="url(#sky-mask)"
        />
        <template v-if="!lanesMode">
          <g v-if="bars.length" clip-path="url(#trends-plot)">
            <template v-for="bar in bars" :key="`bar-${bar.start}`">
              <rect
                v-if="bar.highlight"
                :x="bar.highlight.x" :y="PAD.top"
                :width="bar.highlight.width" :height="inner.height"
                fill="#f4f4f5" fill-opacity="0.06"
              />
              <rect
                v-for="rect in bar.rects"
                :key="rect.key"
                :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height"
                :fill="rect.fill" rx="1"
              />
            </template>
          </g>
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
            :x="PAD.left + 2" :y="tick.y"
            text-anchor="start" class="fill-zinc-500 text-[10px] tabular-nums"
          >
            {{ tick.label }}
          </text>
        </template>
        <g v-else clip-path="url(#trends-plot)">
          <rect
            v-if="laneHighlight"
            :x="laneHighlight.x" :y="PAD.top"
            :width="laneHighlight.width" :height="inner.height"
            fill="#f4f4f5" fill-opacity="0.06"
          />
          <g v-for="lane in lanes" :key="`lane-${lane.key}`">
            <path v-if="lane.area" :d="lane.area" :fill="LINE_COLORS.batterySoc" fill-opacity="0.12" />
            <line
              v-if="lane.zeroY != null"
              :x1="PAD.left" :x2="rightEdge" :y1="lane.zeroY" :y2="lane.zeroY"
              stroke="#3f3f46" stroke-dasharray="4 4" stroke-width="1"
            />
            <rect
              v-for="rect in lane.rects"
              :key="rect.key"
              :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height"
              :fill="rect.fill" rx="1"
            />
            <path
              v-if="lane.path"
              :d="lane.path"
              :stroke="lane.stroke"
              :stroke-width="strokeWidth"
              stroke-linejoin="round"
              stroke-linecap="round"
              fill="none"
            />
            <text :x="PAD.left + 2" :y="lane.labelY" class="fill-zinc-500 text-[10px] tabular-nums">
              {{ lane.label }}
            </text>
          </g>
          <circle
            v-for="dot in scrub ? laneScrubDots : []"
            :key="`lane-scrub-${dot.key}`"
            :cx="scrub.x" :cy="dot.cy" r="3"
            :fill="dot.color"
          />
          <line
            v-if="scrub"
            :x1="scrub.x" :x2="scrub.x" :y1="PAD.top" :y2="baselineY"
            stroke="#f4f4f5" stroke-opacity="0.5" stroke-width="1"
          />
        </g>
        <text
          v-for="tick in xTicks"
          :key="`x-${tick.t}`"
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
        v-if="size.width > 0 && !hasChartData"
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
        title="Back to now"
        @click="goLive"
      >
        <ChevronLast class="h-4 w-4" />
        Now
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

<style scoped>
@media (orientation: landscape) and (max-height: 480px) and (hover: none) and (pointer: coarse) {
  .trends-section {
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }

  .trends-readout {
    flex-direction: row-reverse;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .trends-readout-idle {
    display: none;
  }

  .trends-legend {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    column-gap: 0.875rem;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .trends-legend > button {
    flex: none;
  }

  .trends-legend .text-base {
    font-size: 0.875rem;
  }
}
</style>
