import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config, GOOGLE_METRICS, HOMEKIT_METRICS } from './config.js'
import { getTrigger, serializeTriggers } from './triggers.js'
import { tariffConfigured } from './derive.js'
import { state } from './state.js'

export const loadSettings = () => {
  try {
    current = merge(readStored())
  } catch (error) {
    console.log(`[settings] ignoring invalid stored settings: ${error.message}`)
    current = merge(null)
  }
  return current
}

export const getSettings = () => current ?? loadSettings()

export const publicSettings = () => {
  const { google, security, ...rest } = getSettings()
  return {
    ...rest,
    google: { labels: google.labels, powerUnit: google.powerUnit, batteryDisplay: google.batteryDisplay },
    googleAuthTokenSet: Boolean(google.authToken),
    security: { passcodeSet: Boolean(security.passcode) },
    homekitMetrics: HOMEKIT_METRICS,
    googleMetrics: GOOGLE_METRICS,
    alertTriggers: serializeTriggers(triggerCapabilities())
  }
}

const triggerCapabilities = () => ({
  weatherEnabled: getSettings().weather.enabled,
  tariffConfigured: tariffConfigured(getSettings().tariff),
  batterySohPresent: state.batterySoh != null
})

export const updateSettings = (patch) => {
  current = validate(mergeSections(getSettings(), patch))
  persist(current)
  notify(changedSections(patch))
  return current
}

export const updateSecurity = (security) => {
  current = validate({ ...getSettings(), security })
  persist(current)
  return current.security
}

export const resetSettings = () => {
  rmSync(config.paths.settings, { force: true })
  current = merge(null)
  notify(SECTIONS)
  return current
}

export const onSettingsChange = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const SECTIONS = [
  'sigen', 'poll', 'weather', 'battery', 'tariff', 'history',
  'alerts', 'homekit', 'server', 'google', 'appearance', 'security'
]

const defaults = () => ({
  setupComplete: false,
  sigen: { ...config.sigen },
  poll: {
    defaultIntervalMs: config.poll.defaultIntervalMs,
    reconnectDelayMs: config.poll.reconnectDelayMs,
    schedule: config.poll.schedule
  },
  weather: { ...config.weather },
  battery: defaultBattery(),
  tariff: defaultTariff(),
  history: { ...config.history },
  alerts: defaultAlerts(),
  homekit: { ...config.homekit, labels: defaultLabels() },
  server: { ...config.server },
  google: { ...config.google, labels: defaultGoogleLabels() },
  appearance: defaultAppearance(),
  security: defaultSecurity()
})

const defaultBattery = () => ({ capacityKwh: null, reserveSoc: 0, chargeUnit: 'percent' })

const defaultSecurity = () => ({ passcode: null })

const defaultAlerts = () => ({ items: [] })

const defaultTariff = () => ({
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
})

const defaultAppearance = () => ({
  title: 'Sigen Home Bridge',
  metricScale: 0.65,
  powerUnit: 'kW',
  powerDecimals: 2,
  devicesButton: 'auto',
  theme: {
    preset: 'default',
    colors: {
      solarAccent: '#f59e0b',
      solarLow: '#a16207',
      solarMid: '#eab308',
      solarHigh: '#fde047',
      socHigh: '#22c55e',
      socMedium: '#f59e0b',
      socLow: '#ef4444',
      gridImport: '#67e8f9',
      gridExport: '#2563eb',
      batteryCharge: '#7c3aed',
      batteryDischarge: '#e879f9',
      home: '#fafafa',
      idle: '#71717a',
      cost: '#fb923c',
      credit: '#22c55e'
    }
  }
})

const merge = (stored) =>
  validate({
    ...mergeSections(defaults(), migrate(stored)),
    setupComplete: stored?.setupComplete ?? Boolean(stored)
  })

const migrate = (stored) => {
  const alerts = stored?.alerts
  if (!alerts) return stored
  if (alerts.rules && !alerts.items) return { ...stored, alerts: fromLegacyRules(alerts) }
  if (alerts.items && (alerts.transports || alerts.items.some(hasFlatChannels))) {
    return { ...stored, alerts: fromSharedTransports(alerts) }
  }
  return stored
}

const hasFlatChannels = (item) =>
  typeof item?.channels?.homekit === 'boolean' || typeof item?.channels?.webhook === 'boolean'

const fromLegacyRules = (legacy) => {
  const labels = legacy.channels?.homekit?.labels ?? {}
  const homekit = Boolean(legacy.channels?.homekit?.enabled)
  const webhook = Boolean(legacy.channels?.webhook?.enabled)
  const url = legacy.channels?.webhook?.url ?? ''
  const master = Boolean(legacy.enabled)
  const build = (id, rule, name, trigger, notify) => ({
    id,
    name: labels[id]?.trim() || name,
    enabled: master && Boolean(rule.enabled),
    trigger,
    notify,
    channels: { homekit: { enabled: homekit, sensorName: '' }, webhook: { enabled: webhook, url } }
  })
  const items = []
  if (legacy.rules?.gatewayOffline) {
    items.push(build('gatewayOffline', legacy.rules.gatewayOffline, 'Gateway Offline',
      { type: 'gatewayOffline', afterMinutes: legacy.rules.gatewayOffline.afterMinutes ?? 3 },
      { raised: true, cleared: true }))
  }
  if (legacy.rules?.lowBattery) {
    items.push(build('lowBattery', legacy.rules.lowBattery, 'Battery Low',
      { type: 'batteryBelow', threshold: legacy.rules.lowBattery.soc ?? 15 },
      { raised: true, cleared: false }))
  }
  return { items }
}

const fromSharedTransports = (intermediate) => {
  const homekitOn = Boolean(intermediate.transports?.homekit?.enabled)
  const webhookOn = Boolean(intermediate.transports?.webhook?.enabled)
  const url = intermediate.transports?.webhook?.url ?? ''
  const master = Boolean(intermediate.enabled)
  return {
    items: (intermediate.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      enabled: master && Boolean(item.enabled),
      trigger: item.trigger,
      notify: item.notify ?? { raised: true, cleared: false },
      channels: {
        homekit: { enabled: homekitOn && Boolean(item.channels?.homekit), sensorName: '' },
        webhook: { enabled: webhookOn && Boolean(item.channels?.webhook), url }
      }
    }))
  }
}

const mergeSections = (base, patch) => ({
  setupComplete: patch?.setupComplete ?? base.setupComplete,
  sigen: { ...base.sigen, ...patch?.sigen },
  poll: { ...base.poll, ...patch?.poll },
  weather: { ...base.weather, ...patch?.weather },
  battery: { ...base.battery, ...patch?.battery },
  history: { ...base.history, ...patch?.history },
  alerts: { items: patch?.alerts?.items ?? base.alerts.items },
  tariff: {
    showOnDashboard: patch?.tariff?.showOnDashboard ?? base.tariff.showOnDashboard,
    costMode: patch?.tariff?.costMode ?? base.tariff.costMode,
    currency: patch?.tariff?.currency ?? base.tariff.currency,
    importRate: patch?.tariff?.importRate ?? base.tariff.importRate,
    exportRate: patch?.tariff?.exportRate ?? base.tariff.exportRate,
    importWindows: patch?.tariff?.importWindows ?? base.tariff.importWindows,
    exportWindows: patch?.tariff?.exportWindows ?? base.tariff.exportWindows,
    supplyChargePerDay: patch?.tariff?.supplyChargePerDay ?? base.tariff.supplyChargePerDay,
    zeroDrawCredit: { ...base.tariff.zeroDrawCredit, ...patch?.tariff?.zeroDrawCredit },
    superExportCredit: { ...base.tariff.superExportCredit, ...patch?.tariff?.superExportCredit }
  },
  homekit: {
    name: patch?.homekit?.name ?? base.homekit.name,
    pin: patch?.homekit?.pin ?? base.homekit.pin,
    port: patch?.homekit?.port ?? base.homekit.port,
    manufacturer: patch?.homekit?.manufacturer ?? base.homekit.manufacturer,
    model: patch?.homekit?.model ?? base.homekit.model,
    powerUnit: patch?.homekit?.powerUnit ?? base.homekit.powerUnit,
    bind: patch?.homekit?.bind ?? base.homekit.bind,
    labels: { ...base.homekit.labels, ...patch?.homekit?.labels }
  },
  server: { ...base.server, ...patch?.server },
  google: {
    authToken: patch?.google?.authToken ?? base.google.authToken,
    powerUnit: patch?.google?.powerUnit ?? base.google.powerUnit,
    batteryDisplay: patch?.google?.batteryDisplay ?? base.google.batteryDisplay,
    labels: { ...base.google.labels, ...patch?.google?.labels }
  },
  appearance: {
    title: patch?.appearance?.title ?? base.appearance.title,
    metricScale: patch?.appearance?.metricScale ?? base.appearance.metricScale,
    powerUnit: patch?.appearance?.powerUnit ?? base.appearance.powerUnit,
    powerDecimals: patch?.appearance?.powerDecimals ?? base.appearance.powerDecimals,
    devicesButton: patch?.appearance?.devicesButton ?? base.appearance.devicesButton,
    theme: {
      preset: patch?.appearance?.theme?.preset ?? base.appearance.theme.preset,
      colors: { ...base.appearance.theme.colors, ...patch?.appearance?.theme?.colors }
    }
  },
  security: { passcode: patch?.security?.passcode ?? base.security.passcode }
})

const validate = (settings) => ({
  setupComplete: Boolean(settings.setupComplete),
  sigen: validSigen(settings.sigen),
  poll: validatePoll(settings.poll),
  weather: validWeather(settings.weather),
  battery: validBattery(settings.battery),
  tariff: validTariff(settings.tariff),
  history: validHistory(settings.history),
  alerts: validAlerts(settings.alerts),
  homekit: validHomekit(settings.homekit),
  server: validServer(settings.server),
  google: validGoogle(settings.google),
  appearance: validAppearance(settings.appearance),
  security: validSecurity(settings.security)
})

const validSecurity = ({ passcode } = {}) => ({ passcode: validStoredPasscode(passcode) })

const validStoredPasscode = (value) => {
  if (value === null || value === undefined) return null
  const { hash, salt } = value
  if (!isHex(hash) || !isHex(salt)) throw badRequest('stored passcode is malformed')
  return { hash, salt }
}

const isHex = (value) => typeof value === 'string' && /^[0-9a-f]+$/i.test(value)

const validBattery = ({ capacityKwh, reserveSoc, chargeUnit }) => ({
  capacityKwh: validCapacity(capacityKwh),
  reserveSoc: validReserveSoc(reserveSoc),
  chargeUnit: validEnum(chargeUnit, BATTERY_CHARGE_UNITS, 'percent', 'battery charge unit')
})

const BATTERY_CHARGE_UNITS = ['percent', 'energy']

const validCapacity = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_BATTERY_CAPACITY_KWH) {
    throw badRequest(`battery capacity must be a number between 0 and ${MAX_BATTERY_CAPACITY_KWH} kWh`)
  }
  return parsed
}

const validReserveSoc = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_RESERVE_SOC) {
    throw badRequest(`reserve SoC must be an integer between 0 and ${MAX_RESERVE_SOC}`)
  }
  return value
}

const validHistory = ({ retentionDays }) => ({ retentionDays: validRetentionDays(retentionDays) })

const validRetentionDays = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RETENTION_DAYS) {
    throw badRequest(`history retention must be an integer between 1 and ${MAX_RETENTION_DAYS} days`)
  }
  return value
}

const validAlerts = ({ items }) => ({ items: validAlertItems(items) })

const validAlertItems = (items) => {
  if (items === undefined || items === null) return []
  if (!Array.isArray(items)) throw badRequest('alerts must be an array')
  if (items.length > MAX_ALERTS) throw badRequest(`at most ${MAX_ALERTS} alerts are allowed`)
  return items.map(validAlertItem)
}

const validAlertItem = (item) => {
  const trigger = getTrigger(item?.trigger?.type)
  if (!trigger) throw badRequest(`unknown alert trigger: ${item?.trigger?.type}`)
  const name = validText(item?.name, trigger.label, 'alert name')
  return {
    id: validAlertId(item?.id),
    name,
    enabled: Boolean(item?.enabled),
    trigger: validTriggerParams(trigger, item.trigger),
    notify: { raised: Boolean(item?.notify?.raised), cleared: Boolean(item?.notify?.cleared) },
    channels: {
      homekit: {
        enabled: Boolean(item?.channels?.homekit?.enabled),
        sensorName: validText(item?.channels?.homekit?.sensorName, '', 'alert sensor name')
      },
      webhook: validWebhook(item?.channels?.webhook)
    }
  }
}

const validAlertId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : randomUUID()

const validTriggerParams = (trigger, raw) => {
  const params = { type: trigger.type }
  for (const spec of trigger.params) params[spec.key] = validTriggerParam(raw?.[spec.key], spec)
  return params
}

const validTriggerParam = (value, spec) => {
  const parsed = value === undefined || value === null || value === '' ? spec.default : Number(value)
  if (!Number.isFinite(parsed) || parsed < spec.min || parsed > spec.max) {
    throw badRequest(`alert ${spec.key} must be a number between ${spec.min} and ${spec.max}`)
  }
  if (spec.step === 1 && !Number.isInteger(parsed)) {
    throw badRequest(`alert ${spec.key} must be a whole number`)
  }
  return parsed
}

const validWebhook = (webhook) => {
  const enabled = Boolean(webhook?.enabled)
  const url = validWebhookUrl(webhook?.url)
  if (enabled && !url) throw badRequest('webhook URL is required when the webhook is enabled')
  return { enabled, url }
}

const validWebhookUrl = (value) => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw badRequest('webhook URL must be a string')
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!isHttpUrl(trimmed)) throw badRequest('webhook URL must be a valid http(s) URL')
  return trimmed
}

const isHttpUrl = (value) => {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const validTariff = ({
  showOnDashboard, costMode, currency, importRate, exportRate, importWindows,
  exportWindows, supplyChargePerDay, zeroDrawCredit, superExportCredit
}) => ({
  showOnDashboard: Boolean(showOnDashboard),
  costMode: validEnum(costMode, COST_MODES, 'perDay', 'cost mode'),
  currency: validCurrency(currency),
  importRate: validRate(importRate, 'import rate'),
  exportRate: validRate(exportRate, 'export rate'),
  importWindows: validRateWindows(importWindows, 'import'),
  exportWindows: validRateWindows(exportWindows, 'export'),
  supplyChargePerDay: validRate(supplyChargePerDay, 'supply charge'),
  zeroDrawCredit: validZeroDraw(zeroDrawCredit),
  superExportCredit: validSuperExport(superExportCredit)
})

const COST_MODES = ['perDay', 'perHour']

const validCurrency = (value) => {
  if (value === undefined || value === null || value === '') return 'USD'
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw badRequest('currency must be a 3-letter code like USD')
  }
  return value.trim().toUpperCase()
}

const validRate = (value, label) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw badRequest(`${label} must be a number >= 0`)
  return parsed
}

const validRateWindows = (windows, label) => {
  if (windows === undefined || windows === null) return []
  if (!Array.isArray(windows)) throw badRequest(`${label} windows must be an array`)
  return windows.map((window) => validRateWindow(window, label))
}

const validRateWindow = (window, label) => {
  const { start, end, rate } = window ?? {}
  if (!isClock(start) || !isClock(end)) throw badRequest(`${label} window start and end must be HH:MM`)
  return { start, end, rate: validRate(rate, `${label} window rate`) }
}

const validZeroDraw = (credit) => {
  const { enabled, start, end, perDay } = credit ?? {}
  if (!isClock(start) || !isClock(end)) throw badRequest('zero-draw credit start and end must be HH:MM')
  return { enabled: Boolean(enabled), start, end, perDay: validRate(perDay, 'zero-draw credit') }
}

const validSuperExport = (credit) => {
  const { enabled, start, end, capKwh, rate } = credit ?? {}
  if (!isClock(start) || !isClock(end)) throw badRequest('super export credit start and end must be HH:MM')
  return {
    enabled: Boolean(enabled),
    start,
    end,
    capKwh: validRate(capKwh, 'super export cap'),
    rate: validRate(rate, 'super export rate')
  }
}

const validAppearance = ({ title, metricScale, powerUnit, powerDecimals, devicesButton, theme }) => ({
  title: validTitle(title),
  metricScale: validMetricScale(metricScale),
  powerUnit: validEnum(powerUnit, APPEARANCE_POWER_UNITS, 'kW', 'dashboard power unit'),
  powerDecimals: validPowerDecimals(powerDecimals),
  devicesButton: validEnum(devicesButton, DEVICES_BUTTON_MODES, 'auto', 'devices button'),
  theme: { preset: validPreset(theme?.preset), colors: validColors(theme?.colors) }
})

const APPEARANCE_POWER_UNITS = ['kW', 'W']

const DEVICES_BUTTON_MODES = ['auto', 'show', 'hide']

const validPowerDecimals = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_POWER_DECIMALS) {
    throw badRequest(`dashboard power decimals must be an integer between 0 and ${MAX_POWER_DECIMALS}`)
  }
  return value
}

const validMetricScale = (value) => {
  if (!Number.isFinite(value) || value < 0.3 || value > 3) {
    throw badRequest('metric scale must be a number between 0.3 and 3')
  }
  return value
}

const validTitle = (value) => {
  if (typeof value !== 'string') throw badRequest('dashboard title must be a string')
  const trimmed = value.trim()
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw badRequest(`dashboard title must be at most ${MAX_TITLE_LENGTH} characters`)
  }
  return trimmed || defaultAppearance().title
}

const validPreset = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : 'custom'

const validColors = (colors) =>
  Object.fromEntries(
    Object.keys(defaultAppearance().theme.colors).map((key) => [key, validHex(colors?.[key], key)]))

const validHex = (value, label) => {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw badRequest(`${label} must be a hex colour like #22c55e`)
  }
  return value.trim().toLowerCase()
}

const validSigen = ({ host, port, unitId }) => ({
  host: validHost(host),
  port: validPort(port, 'gateway port'),
  unitId: validUnitId(unitId)
})

const validatePoll = ({ defaultIntervalMs, reconnectDelayMs, schedule }) => ({
  defaultIntervalMs: validInterval(defaultIntervalMs, 'defaultIntervalMs'),
  reconnectDelayMs: validInterval(reconnectDelayMs, 'reconnectDelayMs'),
  schedule: validSchedule(schedule)
})

const validWeather = ({ enabled, latitude, longitude, units, refreshMs }) => ({
  enabled: Boolean(enabled),
  latitude: validCoord(latitude, 90, 'latitude'),
  longitude: validCoord(longitude, 180, 'longitude'),
  units: validUnits(units),
  refreshMs: validInterval(refreshMs, 'weather refresh', MIN_WEATHER_REFRESH_MS)
})

const validHomekit = ({ name, pin, port, manufacturer, model, powerUnit, bind, labels }) => ({
  name: validName(name, 'homekit name'),
  pin: validPin(pin),
  port: validPort(port, 'homekit port'),
  manufacturer: validText(manufacturer, config.homekit.manufacturer, 'homekit manufacturer'),
  model: validText(model, config.homekit.model, 'homekit model'),
  powerUnit: validEnum(powerUnit, HOMEKIT_POWER_UNITS, 'kilowatts', 'homekit power unit'),
  bind: validBind(bind),
  labels: validLabels(labels)
})

const HOMEKIT_POWER_UNITS = ['kilowatts', 'watts']

const validBind = (value) => {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw badRequest('homekit bind must be a string')
  return value.trim() || undefined
}

const defaultLabels = () =>
  Object.fromEntries(HOMEKIT_METRICS.map(({ key, defaultName }) => [key, defaultName]))

const validLabels = (labels) =>
  Object.fromEntries(HOMEKIT_METRICS.map(({ key, defaultName }) =>
    [key, validText(labels?.[key], defaultName, `homekit ${key} label`)]))

const validText = (value, fallback, label) => {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw badRequest(`${label} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length > MAX_HOMEKIT_TEXT_LENGTH) {
    throw badRequest(`${label} must be at most ${MAX_HOMEKIT_TEXT_LENGTH} characters`)
  }
  return trimmed || fallback
}

const validServer = ({ port }) => ({ port: validPort(port, 'server port') })

const validGoogle = ({ authToken, labels, powerUnit, batteryDisplay }) => ({
  authToken: validName(authToken, 'google auth token'),
  labels: validGoogleLabels(labels),
  powerUnit: validEnum(powerUnit, GOOGLE_POWER_UNITS, 'watts', 'google power unit'),
  batteryDisplay: validEnum(batteryDisplay, GOOGLE_BATTERY_DISPLAYS, 'tile', 'google battery display')
})

const GOOGLE_POWER_UNITS = ['watts', 'kilowatts', 'hidden']
const GOOGLE_BATTERY_DISPLAYS = ['tile', 'reading']

const validEnum = (value, allowed, fallback, label) => {
  if (value === undefined || value === null) return fallback
  if (!allowed.includes(value)) throw badRequest(`${label} must be one of: ${allowed.join(', ')}`)
  return value
}

const defaultGoogleLabels = () =>
  Object.fromEntries(GOOGLE_METRICS.map(({ key, defaultName }) => [key, defaultName]))

const validGoogleLabels = (labels) =>
  Object.fromEntries(GOOGLE_METRICS.map(({ key, defaultName }) =>
    [key, validText(labels?.[key], defaultName, `google ${key} label`)]))

const validSchedule = (schedule) => {
  if (!Array.isArray(schedule)) throw badRequest('schedule must be an array')
  return schedule.map(validWindow)
}

const validWindow = (window) => {
  const { start, end, intervalMs } = window ?? {}
  if (!isClock(start) || !isClock(end)) throw badRequest('window start and end must be HH:MM')
  return { start, end, intervalMs: validInterval(intervalMs, 'window interval') }
}

const validInterval = (value, label, min = MIN_INTERVAL_MS) => {
  if (!Number.isInteger(value) || value < min) {
    throw badRequest(`${label} must be an integer >= ${min}`)
  }
  return value
}

const validHost = (value) => (typeof value === 'string' ? value.trim() : '')

const validPort = (value, label) => {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw badRequest(`${label} must be an integer between 1 and 65535`)
  }
  return value
}

const validUnitId = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw badRequest('unit ID must be an integer between 0 and 255')
  }
  return value
}

const validCoord = (value, max, label) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > max) {
    throw badRequest(`${label} must be a number between -${max} and ${max}`)
  }
  return parsed
}

const validUnits = (value) => {
  if (value !== 'celsius' && value !== 'fahrenheit') throw badRequest('units must be celsius or fahrenheit')
  return value
}

const validName = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${label} is required`)
  return value.trim()
}

const validPin = (value) => {
  if (typeof value !== 'string' || !/^\d{3}-\d{2}-\d{3}$/.test(value)) {
    throw badRequest('homekit pin must look like 516-35-163')
  }
  return value
}

const isClock = (value) => {
  if (typeof value !== 'string') return false
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return false
  return Number(match[1]) < 24 && Number(match[2]) < 60
}

const changedSections = (patch) => SECTIONS.filter((section) => patch?.[section] !== undefined)

const notify = (changed) => {
  for (const listener of listeners) listener(changed)
}

const readStored = () => {
  try {
    return JSON.parse(readFileSync(config.paths.settings, 'utf8'))
  } catch {
    return null
  }
}

const persist = (settings) => {
  mkdirSync(dirname(config.paths.settings), { recursive: true })
  writeFileSync(config.paths.settings, `${JSON.stringify(settings, null, 2)}\n`)
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 })

const MIN_INTERVAL_MS = 1000

const MAX_TITLE_LENGTH = 60

const MAX_HOMEKIT_TEXT_LENGTH = 64

const MIN_WEATHER_REFRESH_MS = 60000

const MAX_BATTERY_CAPACITY_KWH = 200

const MAX_RESERVE_SOC = 99

const MAX_RETENTION_DAYS = 90

const MAX_ALERTS = 24

const MAX_POWER_DECIMALS = 3

let current = null

const listeners = new Set()
