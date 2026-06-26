import { reactive, ref } from 'vue'

export const useStateStream = () => {
  if (stream) return stream

  const state = reactive({
    pvPower: 0,
    gridPower: 0,
    batteryPower: 0,
    batterySoc: 0,
    batterySoh: null,
    loadPower: 0,
    ratedEnergyCapacity: null,
    consumedToday: null,
    lifetimePv: null,
    lifetimeConsumed: null,
    lifetimeGridImport: null,
    lifetimeGridExport: null,
    lifetimeBatteryCharge: null,
    lifetimeBatteryDischarge: null,
    outdoorTemp: null,
    weatherCode: null,
    outdoorLocation: null,
    outdoorLatitude: null,
    outdoorLongitude: null,
    lastUpdated: null,
    pollIntervalMs: null,
    connected: false,
    alerts: [],
    devices: []
  })
  const connected = ref(false)
  let retry = MIN_RETRY_MS

  const apply = (payload) => {
    Object.assign(state, payload)
    connected.value = Boolean(payload.connected)
  }

  const connect = () => {
    const source = new EventSource('/events')
    let lastActivity = Date.now()
    const markActivity = () => { lastActivity = Date.now() }
    source.onopen = markActivity
    source.addEventListener('ping', markActivity)
    source.onmessage = (event) => {
      markActivity()
      apply(JSON.parse(event.data))
      retry = MIN_RETRY_MS
    }
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity < STALL_MS) return
      clearInterval(watchdog)
      connected.value = false
      source.close()
      connect()
    }, WATCHDOG_INTERVAL_MS)
    source.onerror = () => {
      clearInterval(watchdog)
      connected.value = false
      source.close()
      setTimeout(connect, retry)
      retry = Math.min(retry * 2, MAX_RETRY_MS)
    }
  }

  const seed = async () => {
    try {
      apply(await (await fetch('/api/state')).json())
    } catch {}
  }

  seed()
  connect()

  stream = { state, connected }
  return stream
}

let stream = null

const MIN_RETRY_MS = 1000

const MAX_RETRY_MS = 30000

const STALL_MS = 45000

const WATCHDOG_INTERVAL_MS = 5000
