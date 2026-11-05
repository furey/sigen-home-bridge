import {
  closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync
} from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config, CONFIG_DEFAULTS, GOOGLE_METRICS, HOMEKIT_METRICS } from './config.js'
import { convertTriggerUnits, getTrigger, serializeTriggers } from './triggers.js'
import { tariffConfigured } from './derive.js'
import { state } from './state.js'
import { googleStatus } from './google-status.js'

export const loadSettings = () => {
  const stored = readStored()
  if (stored.error) backUpStored({ problem: `could not be parsed (${stored.error})`, move: true })
  const { settings, reset } = salvage(seed(stored.value))
  if (reset.length) reportReset(reset)
  if (reset.some(({ origin }) => origin === 'stored')) keepSalvaged(settings)
  current = settings
  return current
}

export const getSettings = () => current ?? loadSettings()

export const publicSettings = ({ authenticated = false } = {}) => {
  const settings = getSettings()
  const exposed = exposeSettings(settings)
  const locked = Boolean(settings.security.passcode) && !authenticated
  return locked ? redactSecrets(exposed) : exposed
}

const exposeSettings = ({ google, security, ...rest }) => ({
  ...rest,
  google: { labels: google.labels, powerUnit: google.powerUnit, batteryDisplay: google.batteryDisplay },
  googleAuthTokenSet: Boolean(google.authToken),
  googleStatus: googleStatus(),
  security: { passcodeSet: Boolean(security.passcode) },
  homekitMetrics: HOMEKIT_METRICS,
  googleMetrics: GOOGLE_METRICS,
  alertTriggers: serializeTriggers(triggerCapabilities())
})

const redactSecrets = ({ googleStatus: omitted, ...settings }) => ({
  ...settings,
  sigen: { ...settings.sigen, host: '' },
  homekit: { ...settings.homekit, pin: '' },
  alerts: { ...settings.alerts, items: (settings.alerts?.items ?? []).map(redactWebhookUrl) }
})

const redactWebhookUrl = (item) => ({
  ...item,
  channels: { ...item.channels, webhook: { ...item.channels?.webhook, url: '' } }
})

const triggerCapabilities = () => ({
  units: getSettings().weather.units,
  weatherEnabled: getSettings().weather.enabled,
  tariffConfigured: tariffConfigured(getSettings().tariff),
  batterySohPresent: state.batterySoh != null
})

export const updateSettings = (patch) => {
  const base = withTemperatureUnits(getSettings(), patch?.weather?.units)
  commit(validate(mergeSections(base, patch)))
  notify(changedSections(patch, base !== getSettings()))
  return current
}

export const updateSecurity = (security) => {
  commit(validate({ ...getSettings(), security }))
  return current.security
}

export const resetSettings = () => {
  const kept = { setupComplete: false, history: getSettings().history }
  persist(kept)
  current = merge(kept)
  notify(SECTIONS.filter((section) => !RESET_KEEPS.includes(section)))
  return current
}

export const onSettingsChange = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const SECTIONS = [
  'sigen', 'poll', 'weather', 'battery', 'tariff', 'history', 'smartLoads', 'solar',
  'alerts', 'homekit', 'server', 'google', 'appearance', 'security'
]

const RESET_KEEPS = ['history']

const commit = (next) => {
  persist(next)
  current = next
}

const withTemperatureUnits = (settings, units) => {
  const from = settings.weather.units
  if (!units || units === from) return settings
  const convert = (item) => ({ ...item, trigger: convertTriggerUnits({ trigger: item.trigger, from, to: units }) })
  return { ...settings, alerts: { ...settings.alerts, items: settings.alerts.items.map(convert) } }
}

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
  smartLoads: { showOnDashboard: false, labels: {} },
  solar: { stringNames: {} },
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

const merge = (stored) => salvage(seed(stored)).settings

const seed = (stored) => ({
  ...mergeSections(defaults(), migrate(stored)),
  setupComplete: stored?.setupComplete ?? Boolean(stored)
})

const salvage = (merged) => {
  const reset = []
  const settings = SECTIONS.reduce((valid, section) => {
    try {
      return { ...valid, [section]: SECTION_VALIDATORS[section](merged[section], valid) }
    } catch {
      const repaired = repairSection({ section, merged, valid })
      reset.push(...repaired.rejected)
      return { ...valid, [section]: repaired.value }
    }
  }, { setupComplete: Boolean(merged.setupComplete) })
  return { settings, reset }
}

const repairSection = ({ section, merged, valid }) => {
  const validator = (raw) => SECTION_VALIDATORS[section](raw, valid)
  const seeded = defaults()[section]
  const fromEnv = layerFields({ base: builtInDefaults()[section], candidate: seeded, validator })
  const fromStored = layerFields({
    base: fromEnv.raw, candidate: fieldsDifferingFrom(merged[section], seeded), validator
  })
  const tag = (origin) => (entry) => ({ ...entry, section, origin })
  return {
    value: validator(fromStored.raw),
    rejected: [...fromEnv.rejected.map(tag('environment-seeded')), ...fromStored.rejected.map(tag('stored'))]
  }
}

const layerFields = ({ base, candidate, validator }) => {
  const rejected = []
  const raw = Object.entries(candidate).reduce(
    (accepted, [field, value]) => layerField({ accepted, field, value, validator, rejected }), base)
  return { raw, rejected }
}

const layerField = ({ accepted, field, value, validator, rejected }) => {
  const attempt = { ...accepted, [field]: value }
  const failure = validationError(validator, attempt)
  if (!failure) return attempt
  if (Array.isArray(value) || isPlainObject(value)) {
    return layerParts({ accepted, field, value, validator, rejected })
  }
  rejected.push({ field, reason: failure.message })
  return accepted
}

const layerParts = ({ accepted, field, value, validator, rejected }) => {
  const isList = Array.isArray(value)
  const start = isList ? [] : isPlainObject(accepted[field]) ? accepted[field] : {}
  const add = (parts, key, part) => (isList ? [...parts, part] : { ...parts, [key]: part })
  const kept = Object.entries(value).reduce((parts, [key, part]) => {
    const next = add(parts, key, part)
    const failure = validationError(validator, { ...accepted, [field]: next })
    if (!failure) return next
    rejected.push({ field: `${field}[${key}]`, reason: failure.message })
    return parts
  }, start)
  const result = { ...accepted, [field]: kept }
  return validationError(validator, result) ? accepted : result
}

const validationError = (validator, raw) => {
  try {
    validator(raw)
    return null
  } catch (error) {
    return error
  }
}

const fieldsDifferingFrom = (section, seeded) =>
  isPlainObject(section)
    ? Object.fromEntries(Object.entries(section).filter(([field, value]) => value !== seeded?.[field]))
    : {}

const reportReset = (reset) => {
  for (const { origin, section, field, reason } of reset) {
    console.log(`[settings] ${origin} ${section}.${field} is invalid (${reason}); using the default`)
  }
  const fromFile = reset.filter(({ origin }) => origin === 'stored')
  if (fromFile.length) backUpStored({ problem: `had invalid fields (${fromFile.map(fieldPath).join(', ')})` })
}

const fieldPath = ({ section, field }) => `${section}.${field}`

const keepSalvaged = (settings) => {
  try {
    persist(settings)
  } catch (error) {
    console.log(`[settings] could not save the repaired settings: ${error.message}`)
  }
}

const builtInDefaults = () => {
  const seeded = defaults()
  return Object.fromEntries(SECTIONS.map((section) =>
    [section, { ...seeded[section], ...CONFIG_DEFAULTS[section] }]))
}

const migrate = (stored) => {
  try {
    return migrateAlerts(stored)
  } catch {
    return stored
  }
}

const migrateAlerts = (stored) => {
  const alerts = stored?.alerts
  if (!alerts) return stored
  if (alerts.rules && !alerts.items) return { ...stored, alerts: fromLegacyRules(alerts) }
  if (Array.isArray(alerts.items) && (alerts.transports || alerts.items.some(hasFlatChannels))) {
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
  smartLoads: {
    showOnDashboard: patch?.smartLoads?.showOnDashboard ?? base.smartLoads.showOnDashboard,
    labels: { ...base.smartLoads.labels, ...patch?.smartLoads?.labels }
  },
  solar: { stringNames: mergeStringNames(base.solar.stringNames, patch?.solar?.stringNames) },
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

const mergeStringNames = (base = {}, patch) => {
  if (!isPlainObject(patch)) return base
  const merged = { ...base }
  for (const [key, group] of Object.entries(patch)) {
    merged[key] = isPlainObject(group) ? { ...base[key], ...group } : group
  }
  return merged
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const validate = (settings) => SECTIONS.reduce(
  (valid, section) => ({ ...valid, [section]: SECTION_VALIDATORS[section](settings[section], valid) }),
  { setupComplete: Boolean(settings.setupComplete) })

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

const validSmartLoads = ({ showOnDashboard, labels } = {}) => ({
  showOnDashboard: Boolean(showOnDashboard),
  labels: validSmartLoadLabels(labels)
})

const validSmartLoadLabels = (labels) => {
  if (labels === undefined || labels === null) return {}
  if (typeof labels !== 'object' || Array.isArray(labels)) {
    throw badRequest('smart load labels must be an object keyed by slot number')
  }
  const entries = Object.entries(labels).map(([key, value]) => {
    const slot = Number(key)
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SMART_LOADS) {
      throw badRequest(`smart load label keys must be slot numbers between 1 and ${MAX_SMART_LOADS}`)
    }
    return [String(slot), validText(value, '', `smart load ${slot} label`)]
  })
  return Object.fromEntries(entries.filter(([, label]) => label))
}

const validSolar = ({ stringNames } = {}) => ({ stringNames: validStringNames(stringNames) })

const validStringNames = (names) => {
  if (names === undefined || names === null) return {}
  if (typeof names !== 'object' || Array.isArray(names)) {
    throw badRequest('solar string names must be an object keyed by inverter')
  }
  const groups = Object.entries(names).map(([key, group]) =>
    [validInverterKey(key), validStringGroup(group, key)])
  return Object.fromEntries(groups.filter(([, group]) => Object.keys(group).length))
}

const validInverterKey = (key) => {
  const trimmed = typeof key === 'string' ? key.trim() : ''
  if (!trimmed || trimmed.length > MAX_INVERTER_KEY_LENGTH) {
    throw badRequest('solar string name inverter keys must be non-empty identifiers')
  }
  return trimmed
}

const validStringGroup = (group, key) => {
  if (typeof group !== 'object' || group === null || Array.isArray(group)) {
    throw badRequest(`solar string names for ${key} must be an object keyed by string number`)
  }
  const entries = Object.entries(group).map(([index, value]) => {
    const slot = Number(index)
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_PV_STRINGS) {
      throw badRequest(`solar string name keys must be numbers between 1 and ${MAX_PV_STRINGS}`)
    }
    return [String(slot), validText(value, '', `solar string ${slot} name`)]
  })
  return Object.fromEntries(entries.filter(([, name]) => name))
}

const validAlerts = ({ items }, units) => ({ items: validAlertItems(items, units) })

const validAlertItems = (items, units) => {
  if (items === undefined || items === null) return []
  if (!Array.isArray(items)) throw badRequest('alerts must be an array')
  if (items.length > MAX_ALERTS) throw badRequest(`at most ${MAX_ALERTS} alerts are allowed`)
  return items.map((item) => validAlertItem(item, units))
}

const validAlertItem = (item, units) => {
  const trigger = getTrigger(item?.trigger?.type, { units })
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

const changedSections = (patch, alertsConverted) =>
  SECTIONS.filter((section) => patch?.[section] !== undefined || (section === 'alerts' && alertsConverted))

const notify = (changed) => {
  for (const listener of listeners) listener(changed)
}

const readStored = () => {
  if (!existsSync(config.paths.settings)) return { value: null }
  try {
    const parsed = JSON.parse(readFileSync(config.paths.settings, 'utf8'))
    return isPlainObject(parsed) ? { value: parsed } : { value: null, error: 'not a JSON object' }
  } catch (error) {
    return { value: null, error: error.message }
  }
}

const backUpStored = ({ problem, move = false }) => {
  const backup = `${config.paths.settings}.invalid-${new Date().toISOString().replace(/[:.]/g, '-')}`
  try {
    if (move) renameSync(config.paths.settings, backup)
    else copyFileSync(config.paths.settings, backup)
    console.log(`[settings] settings.json ${problem}; saved a copy to ${backup}`)
  } catch (error) {
    console.log(`[settings] settings.json ${problem}; could not save a copy: ${error.message}`)
  }
}

const persist = (settings) => {
  const temporary = `${config.paths.settings}.tmp`
  mkdirSync(dirname(config.paths.settings), { recursive: true })
  writeDurably(temporary, `${JSON.stringify(settings, null, 2)}\n`)
  renameSync(temporary, config.paths.settings)
}

const writeDurably = (path, text) => {
  const descriptor = openSync(path, 'w')
  try {
    writeSync(descriptor, text)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 })

const SECTION_VALIDATORS = {
  sigen: validSigen,
  poll: validatePoll,
  weather: validWeather,
  battery: validBattery,
  tariff: validTariff,
  history: validHistory,
  smartLoads: validSmartLoads,
  solar: validSolar,
  alerts: (alerts, valid) => validAlerts(alerts, valid.weather?.units),
  homekit: validHomekit,
  server: validServer,
  google: validGoogle,
  appearance: validAppearance,
  security: validSecurity
}

const MIN_INTERVAL_MS = 1000

const MAX_TITLE_LENGTH = 60

const MAX_HOMEKIT_TEXT_LENGTH = 64

const MIN_WEATHER_REFRESH_MS = 60000

const MAX_BATTERY_CAPACITY_KWH = 200

const MAX_RESERVE_SOC = 99

const MAX_RETENTION_DAYS = 90

const MAX_ALERTS = 24

const MAX_SMART_LOADS = 24

const MAX_PV_STRINGS = 4

const MAX_INVERTER_KEY_LENGTH = 64

const MAX_POWER_DECIMALS = 3

let current = null

const listeners = new Set()
