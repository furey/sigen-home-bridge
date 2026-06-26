import { effectScope, shallowRef, watch } from 'vue'
import { useStateStream } from './useStateStream.js'

export const useHistory = () => {
  if (store) return store
  store = effectScope(true).run(createStore)
  return store
}

const createStore = () => {
  const samples = shallowRef([])
  const { state, connected } = useStateStream()

  let lastRefreshAt = 0
  const refresh = async () => {
    lastRefreshAt = Date.now()
    try {
      const loaded = await (await fetch('/api/history')).json()
      if (!Array.isArray(loaded)) return
      samples.value = mergeByTime(loaded, samples.value)
    } catch {}
  }
  const backfillIfGapped = (t) => {
    const latest = samples.value.at(-1)
    const gapped = latest && t - latest.t > BACKFILL_GAP_MS
    if (gapped && Date.now() - lastRefreshAt > REFRESH_COOLDOWN_MS) refresh()
  }

  refresh()
  watch(connected, (up) => { if (up) refresh() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh()
  })

  watch(() => state.lastUpdated, () => {
    if (!state.lastUpdated) return
    const t = Date.parse(state.lastUpdated)
    const latest = samples.value.at(-1)
    if (latest && latest.t >= t) return
    backfillIfGapped(t)
    samples.value = capped([...samples.value, liveSample(state, t)])
  })

  return { samples }
}

let store = null

const MAX_SAMPLES = 20000

const BACKFILL_GAP_MS = 120000

const REFRESH_COOLDOWN_MS = 60000

const liveSample = ({ pvPower, gridPower, batteryPower, batterySoc, loadPower, outdoorTemp }, t) => ({
  t,
  pvPower,
  gridPower,
  batteryPower,
  batterySoc,
  loadPower,
  outdoorTemp: outdoorTemp ?? null
})

const mergeByTime = (loaded, live) => {
  const byTime = new Map()
  for (const sample of [...loaded, ...live]) {
    if (Number.isFinite(sample?.t)) byTime.set(sample.t, sample)
  }
  return capped([...byTime.values()].sort((a, b) => a.t - b.t))
}

const capped = (list) => (list.length > MAX_SAMPLES ? list.slice(-MAX_SAMPLES) : list)
