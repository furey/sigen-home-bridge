import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseScheduleEnv } from './schedule.js'

const rootDir = fileURLToPath(new URL('..', import.meta.url))

loadEnv({ path: resolve(rootDir, '.env'), quiet: true })

const dataDir = resolve(rootDir, process.env.DATA_DIR ?? './data')

export const config = Object.freeze({
  sigen: {
    host: process.env.SIGEN_IP ?? '',
    port: number(process.env.SIGEN_PORT, 502),
    unitId: number(process.env.SIGEN_UNIT_ID, 247)
  },
  server: {
    port: number(process.env.SERVER_PORT, 5163)
  },
  homekit: {
    name: process.env.HOMEKIT_NAME ?? 'Sigenergy',
    pin: process.env.HOMEKIT_PIN ?? '516-35-163',
    port: number(process.env.HOMEKIT_PORT, 51826),
    bind: process.env.HOMEKIT_BIND || undefined,
    manufacturer: 'Sigenergy',
    model: 'Sigen Home Bridge',
    powerUnit: process.env.HOMEKIT_POWER_UNIT ?? 'kilowatts'
  },
  google: {
    authToken: process.env.GOOGLE_AUTH_TOKEN ?? 'sigen-home-bridge-token',
    powerUnit: process.env.GOOGLE_POWER_UNIT ?? 'watts',
    batteryDisplay: process.env.GOOGLE_BATTERY_DISPLAY ?? 'tile'
  },
  poll: {
    defaultIntervalMs: number(process.env.POLL_INTERVAL_MS, 5000),
    reconnectDelayMs: number(process.env.RECONNECT_DELAY_MS, 10000),
    schedule: parseScheduleEnv(process.env.POLL_SCHEDULE)
  },
  weather: {
    enabled: process.env.WEATHER_ENABLED !== 'false',
    latitude: optionalNumber(process.env.LATITUDE),
    longitude: optionalNumber(process.env.LONGITUDE),
    units: process.env.WEATHER_UNITS ?? 'celsius',
    refreshMs: number(process.env.WEATHER_REFRESH_MS, 600000)
  },
  history: {
    retentionDays: number(process.env.HISTORY_RETENTION_DAYS, 7)
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
