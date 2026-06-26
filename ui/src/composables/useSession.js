import { computed, ref } from 'vue'

export const useSession = () => ({
  token,
  unlocked: computed(() => Boolean(token.value)),
  expiredMidEdit,
  setToken,
  clearToken,
  authHeaders
})

const setToken = (value) => {
  token.value = value
  expiredMidEdit.value = false
  writeToken(value)
}

const clearToken = () => {
  token.value = null
  writeToken(null)
}

const authHeaders = () => (token.value ? { Authorization: `Bearer ${token.value}` } : {})

const readToken = () => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

const writeToken = (value) => {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}

const STORAGE_KEY = 'sigenSettingsSession'

const token = ref(readToken())

const expiredMidEdit = ref(false)
