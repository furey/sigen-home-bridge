import { getSettings, onSettingsChange } from './settings.js'
import { state, publish } from './state.js'

export const startWeather = () => {
  onSettingsChange((changed) => {
    if (changed.includes('weather')) reload()
  })
  reload()
}

export const testWeather = async ({ latitude, longitude, units }) => {
  try {
    const location = await locate({ latitude, longitude })
    if (!location) return { ok: false, error: 'could not detect a location from the server IP' }
    const response = await fetch(buildForecastUrl({ ...location, units }))
    if (!response.ok) throw new Error(`forecast ${response.status}`)
    const { outdoorTemp } = pickCurrent(await response.json())
    return { ok: true, location: labelFor(location), temperature: outdoorTemp, units }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export const buildForecastUrl = ({ latitude, longitude, units }) => {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,weather_code',
    temperature_unit: units
  })
  return `${FORECAST_URL}?${params}`
}

export const pickCurrent = (payload) => ({
  outdoorTemp: payload?.current?.temperature_2m ?? null,
  weatherCode: payload?.current?.weather_code ?? null
})

const reload = async () => {
  clearTimeout(timer)
  timer = null
  const { enabled } = getSettings().weather
  if (!enabled) return disable()
  const location = await resolveLocation()
  if (!location) {
    log(`no location resolved; retrying in ${RETRY_MS / 1000}s`)
    timer = setTimeout(reload, RETRY_MS)
    return
  }
  Object.assign(state, { outdoorLatitude: location.latitude, outdoorLongitude: location.longitude })
  publish()
  poll(location)
}

const poll = async (location) => {
  await refresh(location)
  const delay = state.outdoorTemp === null ? RETRY_MS : getSettings().weather.refreshMs
  timer = setTimeout(() => poll(location), delay)
}

const refresh = async (location) => {
  try {
    const url = buildForecastUrl({ ...location, units: getSettings().weather.units })
    const { outdoorTemp, weatherCode } = pickCurrent(await fetchForecast(url))
    Object.assign(state, { outdoorTemp, weatherCode, outdoorLocation: labelFor(location) })
    publish()
    log(`${outdoorTemp}° at ${labelFor(location)} (code ${weatherCode})`)
  } catch (error) {
    log(`error: ${error.message}`)
  }
}

const fetchForecast = async (url) => {
  try {
    return await getForecast(url)
  } catch (error) {
    log(`retrying once after error: ${error.message}`)
    await sleep(FETCH_RETRY_DELAY_MS)
    return getForecast(url)
  }
}

const getForecast = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`forecast ${response.status}`)
  return response.json()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const resolveLocation = () => {
  const { latitude, longitude } = getSettings().weather
  return locate({ latitude, longitude })
}

const locate = async ({ latitude, longitude }) =>
  isCoord(latitude) && isCoord(longitude)
    ? { latitude: Number(latitude), longitude: Number(longitude), name: null }
    : geolocate()

const geolocate = async () => {
  try {
    const response = await fetch(GEO_URL)
    if (!response.ok) throw new Error(`geo ${response.status}`)
    const body = await response.json()
    if (body.status !== 'success') throw new Error(body.message ?? 'geo lookup failed')
    log(`located ${body.city ?? 'IP'} (${body.lat}, ${body.lon})`)
    return { latitude: body.lat, longitude: body.lon, name: body.city ?? null }
  } catch (error) {
    log(`geolocation error: ${error.message}`)
    return null
  }
}

const disable = () => {
  Object.assign(state, {
    outdoorTemp: null,
    weatherCode: null,
    outdoorLocation: null,
    outdoorLatitude: null,
    outdoorLongitude: null
  })
  publish()
  log('disabled')
}

const labelFor = ({ name, latitude, longitude }) =>
  name ?? `${Number(latitude).toFixed(2)}, ${Number(longitude).toFixed(2)}`

const isCoord = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))

const log = (message) => console.log(`[weather] ${message}`)

let timer = null

const RETRY_MS = 30000

const FETCH_RETRY_DELAY_MS = 2000

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

const GEO_URL = 'http://ip-api.com/json/?fields=status,message,city,lat,lon'
