import { effectScope, reactive, watch } from 'vue'
import { METRICS } from '../lib/metrics.js'

export const TREND_RANGES = [
  { key: '1m', label: '1m', ms: 60000 },
  { key: '5m', label: '5m', ms: 300000 },
  { key: '15m', label: '15m', ms: 900000 },
  { key: '1h', label: '1h', ms: 3600000 },
  { key: '6h', label: '6h', ms: 21600000 },
  { key: '24h', label: '24h', ms: 86400000 },
  { key: '2d', label: '2d', ms: 172800000 },
  { key: '7d', label: '7d', ms: 604800000 },
  { key: '14d', label: '14d', ms: 1209600000 },
  { key: '30d', label: '30d', ms: 2592000000 },
  { key: '90d', label: '90d', ms: 7776000000 }
]

export const useDashboardView = () => {
  if (store) return store
  store = effectScope(true).run(createStore)
  return store
}

const createStore = () => {
  const view = reactive(restore())
  watch(view, persist)

  const setRange = (key) => { view.range = key }
  const toggleMetric = (key) => {
    if (view.hidden.length === 0) {
      view.hidden = METRIC_KEYS.filter((entry) => entry !== key)
      return
    }
    const visibleKeys = METRIC_KEYS.filter((entry) => !view.hidden.includes(entry))
    const isOnlyVisible = visibleKeys.length === 1 && visibleKeys[0] === key
    if (isOnlyVisible) {
      view.hidden = []
      return
    }
    view.hidden = view.hidden.includes(key)
      ? view.hidden.filter((entry) => entry !== key)
      : [...view.hidden, key]
  }
  return { view, setRange, toggleMetric }
}

export const rangeFor = (key) => TREND_RANGES[Math.max(0, rangeIndex(key))]

let store = null

const METRIC_KEYS = METRICS.map((metric) => metric.key)

const STORAGE_KEY = 'sigenDashboardView'

const DEFAULTS = { trends: false, range: '1h', hidden: [] }

const rangeIndex = (key) => TREND_RANGES.findIndex((range) => range.key === key)

const restore = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
    return {
      trends: Boolean(saved.trends),
      range: rangeIndex(saved.range) >= 0 ? saved.range : DEFAULTS.range,
      hidden: Array.isArray(saved.hidden)
        ? saved.hidden.filter((key) => typeof key === 'string')
        : []
    }
  } catch {
    return { ...DEFAULTS, hidden: [] }
  }
}

const persist = (view) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view))
  } catch {}
}
