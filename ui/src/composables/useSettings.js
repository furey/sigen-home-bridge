import { reactive, ref } from 'vue'
import {
  DEFAULT_COLORS, DEFAULT_METRIC_SCALE, DEFAULT_POWER_DECIMALS, DEFAULT_POWER_UNIT, DEFAULT_TITLE,
  applyAppearance
} from '../lib/theme.js'
import { withMinDuration } from '../lib/withMinDuration.js'
import { useSession } from './useSession.js'

export const useSettings = () => {
  const load = async () => {
    status.value = 'loading'
    try {
      Object.assign(data, await (await fetch('/api/settings')).json())
      applyAppearance(data.appearance)
      loadedOnce = true
      status.value = 'idle'
    } catch (loadError) {
      error.value = loadError.message
      status.value = 'error'
    }
    return data
  }

  const loadOnce = async () => (loadedOnce ? data : load())

  const save = async (patch) => {
    status.value = 'saving'
    error.value = ''
    try {
      const body = await withMinDuration(putSettings(patch))
      Object.assign(data, body)
      applyAppearance(data.appearance)
      status.value = 'saved'
      return body
    } catch (saveError) {
      error.value = saveError.message
      status.value = 'error'
      throw saveError
    }
  }

  const applyPatch = async (patch) => {
    const body = await withMinDuration(putSettings(patch))
    Object.assign(data, body)
    applyAppearance(data.appearance)
    return body
  }

  const reset = async () => {
    const response = await fetch('/api/settings/reset', { method: 'POST', headers: authHeaders() })
    if (response.status === 401) {
      useSession().clearToken()
      throw new Error('Settings are locked')
    }
    Object.assign(data, await response.json())
    applyAppearance(data.appearance)
    return data
  }

  const unlock = async (passcode) => {
    const response = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw Object.assign(new Error(body.error ?? 'Unlock failed'), {
        status: response.status, retryAfter: body.retryAfter, remaining: body.remaining
      })
    }
    return body
  }

  const verifySession = async () => {
    try {
      const { authenticated, passcodeSet } = await (await fetch('/api/session', {
        headers: authHeaders()
      })).json()
      data.security.passcodeSet = passcodeSet
      return authenticated
    } catch {
      return true
    }
  }

  const commitSession = (token) => useSession().setToken(token)

  const lock = async () => {
    const headers = authHeaders()
    useSession().clearToken()
    try {
      await fetch('/api/lock', { method: 'POST', headers })
    } catch {}
  }

  const setPasscode = async (passcode) => {
    const body = await passcodeRequest('/api/security/passcode', { method: 'POST', passcode })
    useSession().setToken(body.token)
    data.security.passcodeSet = true
    return body
  }

  const clearPasscode = async () => {
    await passcodeRequest('/api/security/passcode', { method: 'DELETE' })
    data.security.passcodeSet = false
    useSession().clearToken()
  }

  const testGateway = (sigen) => withMinDuration(postJson('/api/test/gateway', sigen))

  const discoverGateway = (sigen) => postJson('/api/discover/gateway', sigen)

  const testWeather = (weather) => withMinDuration(postJson('/api/test/weather', weather))

  const testAlert = (webhook) => withMinDuration(postJson('/api/test/alert', webhook))

  const shouldRunSetup = async () => {
    await loadOnce()
    return !data.setupComplete && !dismissed()
  }

  return {
    data, status, error, load, loadOnce, save, applyPatch, reset,
    testGateway, discoverGateway, testWeather, testAlert, shouldRunSetup, dismiss, undismiss,
    unlock, verifySession, commitSession, lock, setPasscode, clearPasscode
  }
}

const dismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

const dismiss = () => {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {}
}

const undismiss = () => {
  try {
    localStorage.removeItem(DISMISS_KEY)
  } catch {}
}

const postJson = async (url, body) =>
  (await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })).json()

const putSettings = async (patch) => {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch)
  })
  const body = await response.json()
  if (response.status === 401) {
    const session = useSession()
    session.expiredMidEdit.value = true
    session.clearToken()
    throw Object.assign(new Error(body.error ?? 'Settings are locked'), { locked: true })
  }
  if (!response.ok) throw new Error(body.error ?? 'Save failed')
  return body
}

const passcodeRequest = async (url, { method, passcode }) => {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: passcode === undefined ? undefined : JSON.stringify({ passcode })
  })
  const body = await response.json().catch(() => ({}))
  if (response.status === 401) {
    useSession().clearToken()
    throw new Error(body.error ?? 'Settings are locked')
  }
  if (!response.ok) throw new Error(body.error ?? 'Could not update passcode')
  return body
}

const authHeaders = () => useSession().authHeaders()

const DISMISS_KEY = 'sigenSetupDismissed'

const data = reactive({
  setupComplete: false,
  googleAuthTokenSet: false,
  homekitMetrics: [],
  googleMetrics: [],
  alertTriggers: [],
  google: { labels: {}, powerUnit: 'watts', batteryDisplay: 'tile' },
  sigen: { host: '', port: 502, unitId: 247 },
  poll: { defaultIntervalMs: 5000, reconnectDelayMs: 10000, schedule: [] },
  weather: { enabled: true, latitude: null, longitude: null, units: 'celsius', refreshMs: 600000 },
  battery: { capacityKwh: null, reserveSoc: 0 },
  history: { retentionDays: 7 },
  alerts: { items: [] },
  tariff: {
    showOnDashboard: false,
    costMode: 'perDay',
    currency: 'USD',
    importRate: 0,
    exportRate: 0,
    importWindows: [],
    exportWindows: [],
    supplyChargePerDay: 0,
    zeroDrawCredit: { enabled: false, start: '18:00', end: '21:00', perDay: 0 },
    superExportCredit: { enabled: false, start: '16:00', end: '23:00', capKwh: 15, rate: 0 }
  },
  homekit: {
    name: 'Sigenergy', pin: '516-35-163', port: 51826,
    manufacturer: 'Sigenergy', model: 'Sigen Home Bridge', powerUnit: 'kilowatts', bind: '', labels: {}
  },
  server: { port: 5163 },
  appearance: {
    title: DEFAULT_TITLE,
    metricScale: DEFAULT_METRIC_SCALE,
    powerUnit: DEFAULT_POWER_UNIT,
    powerDecimals: DEFAULT_POWER_DECIMALS,
    devicesButton: 'auto',
    theme: { preset: 'default', colors: { ...DEFAULT_COLORS } }
  },
  security: { passcodeSet: false }
})

const status = ref('idle')

const error = ref('')

let loadedOnce = false
