import { ref } from 'vue'

export const useMetricView = () => {
  if (store) return store

  const mode = ref(restore())
  const viewFor = (count) => Math.min(mode.value, count - 1)
  const advance = (count) => {
    mode.value = (viewFor(count) + 1) % count
    persist(mode.value)
  }

  store = { viewFor, advance }
  return store
}

let store = null

const STORAGE_KEY = 'sigenMetricView'

const restore = () => {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

const persist = (mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(mode))
  } catch {}
}
