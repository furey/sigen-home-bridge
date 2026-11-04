import { config as loadEnv } from 'dotenv'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseScheduleEnv } from './schedule.js'

const rootDir = fileURLToPath(new URL('..', import.meta.url))

loadEnv({ path: resolve(rootDir, '.env'), quiet: true })

const dataDir = resolve(rootDir, process.env.DATA_DIR ?? './data')

export const CONFIG_DEFAULTS = Object.freeze({
  sigen: { host: '', port: 502, unitId: 247 },
  server: { port: 5163 },
  homekit: {
    name: 'Sigenergy',
    pin: '516-35-163',
    port: 51826,
    bind: undefined,
    manufacturer: 'Sigenergy',
    model: 'Sigen Home Bridge',
    powerUnit: 'kilowatts'
  },
  google: {
    authToken: randomBytes(32).toString('hex'),
    powerUnit: 'watts',
    batteryDisplay: 'tile'
  },
  poll: { defaultIntervalMs: 5000, reconnectDelayMs: 10000, schedule: [] },
  weather: { enabled: true, latitude: null, longitude: null, units: 'celsius', refreshMs: 600000 },
  history: { retentionDays: 7 }
})

const fallback = CONFIG_DEFAULTS

export const config = Object.freeze({
  sigen: {
    host: process.env.SIGEN_IP ?? fallback.sigen.host,
    port: number(process.env.SIGEN_PORT, fallback.sigen.port),
    unitId: number(process.env.SIGEN_UNIT_ID, fallback.sigen.unitId)
  },
  server: {
    port: number(process.env.SERVER_PORT, fallback.server.port)
  },
  http: {
    allowedHosts: list(process.env.ALLOWED_HOSTS)
  },
  homekit: {
    name: process.env.HOMEKIT_NAME ?? fallback.homekit.name,
    pin: process.env.HOMEKIT_PIN ?? fallback.homekit.pin,
    port: number(process.env.HOMEKIT_PORT, fallback.homekit.port),
    bind: process.env.HOMEKIT_BIND || undefined,
    manufacturer: fallback.homekit.manufacturer,
    model: fallback.homekit.model,
    powerUnit: process.env.HOMEKIT_POWER_UNIT ?? fallback.homekit.powerUnit
  },
  google: {
    authToken: process.env.GOOGLE_AUTH_TOKEN || fallback.google.authToken,
    powerUnit: process.env.GOOGLE_POWER_UNIT ?? fallback.google.powerUnit,
    batteryDisplay: process.env.GOOGLE_BATTERY_DISPLAY ?? fallback.google.batteryDisplay
  },
  poll: {
    defaultIntervalMs: number(process.env.POLL_INTERVAL_MS, fallback.poll.defaultIntervalMs),
    reconnectDelayMs: number(process.env.RECONNECT_DELAY_MS, fallback.poll.reconnectDelayMs),
    schedule: parseScheduleEnv(process.env.POLL_SCHEDULE)
  },
  weather: {
    enabled: process.env.WEATHER_ENABLED !== 'false',
    latitude: optionalNumber(process.env.LATITUDE),
    longitude: optionalNumber(process.env.LONGITUDE),
    units: process.env.WEATHER_UNITS ?? fallback.weather.units,
    refreshMs: number(process.env.WEATHER_REFRESH_MS, fallback.weather.refreshMs)
  },
  history: {
    retentionDays: number(process.env.HISTORY_RETENTION_DAYS, fallback.history.retentionDays)
  },
  paths: {
    data: dataDir,
    hapPersist: resolve(dataDir, 'hap-persist'),
    settings: resolve(dataDir, 'settings.json'),
    history: resolve(dataDir, 'history.json'),
    historyDb: resolve(dataDir, 'history.db')
  }
})

export const HOMEKIT_METRICS = [
  { key: 'battery', defaultName: 'Battery Percent' },
  { key: 'pvPower', defaultName: 'Solar Production' },
  { key: 'gridPower', defaultName: 'Grid Power' },
  { key: 'batteryPower', defaultName: 'Battery Power' },
  { key: 'loadPower', defaultName: 'Home Consumption' }
]

export const GOOGLE_METRICS = [
  { key: 'batterySoc', defaultName: 'Battery Percent' },
  { key: 'pvPower', defaultName: 'Solar Production' },
  { key: 'gridPower', defaultName: 'Grid Power' },
  { key: 'batteryPower', defaultName: 'Battery Power' },
  { key: 'loadPower', defaultName: 'Home Consumption' }
]

function number(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalNumber(value) {
  if (value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function list(value) {
  return (value ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
}
