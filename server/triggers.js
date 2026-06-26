export const getTrigger = (type) => catalogue().find((trigger) => trigger.type === type)

export const serializeTriggers = (context) =>
  catalogue().map(({ type, label, group, params, contactHint, defaultNotify, available }) => ({
    type,
    label,
    group,
    params,
    contactHint,
    defaultNotify,
    available: available(context)
  }))

const catalogue = () => (cache ??= [
  gatewayOffline,
  threshold({
    type: 'batteryBelow', label: 'Battery low', group: 'Battery',
    signal: (ctx) => ctx.connected ? ctx.batterySoc : null, comparison: 'below',
    paramLabel: 'Charge at or below', unit: '%', min: 1, max: 99, default: 15, hysteresis: 5,
    contactHint: 'Open while charge is low',
    describe: ({ value }) => `Battery charge is at ${Math.round(value)}%`
  }),
  threshold({
    type: 'batteryAbove', label: 'Battery high', group: 'Battery',
    signal: (ctx) => ctx.connected ? ctx.batterySoc : null, comparison: 'above',
    paramLabel: 'Charge at or above', unit: '%', min: 1, max: 99, default: 90, hysteresis: 5,
    contactHint: 'Open while charge is high',
    describe: ({ value }) => `Battery charge is at ${Math.round(value)}%`
  }),
  threshold({
    type: 'batteryHealthBelow', label: 'Battery health low', group: 'Battery',
    signal: (ctx) => ctx.batterySoh, comparison: 'below',
    paramLabel: 'Health at or below', unit: '%', min: 1, max: 99, default: 80, hysteresis: 2,
    available: (ctx) => ctx.batterySohPresent,
    contactHint: 'Open while battery health is low',
    describe: ({ value }) => `Battery health is at ${Math.round(value)}%`
  }),
  threshold({
    type: 'batteryEmptyWithin', label: 'Battery emptying soon', group: 'Battery',
    signal: (ctx) => emptyingMinutes(ctx), comparison: 'below',
    paramLabel: 'Reaches reserve within', unit: 'min', min: 5, max: 720, step: 5, default: 60, hysteresis: 10,
    contactHint: 'Open while the battery is about to hit reserve',
    describe: ({ value }) => `Battery reaches reserve in about ${Math.round(value)} min`
  }),
  threshold({
    type: 'gridImportAbove', label: 'High grid import', group: 'Grid',
    signal: (ctx) => Math.max(0, ctx.gridPower), comparison: 'above',
    paramLabel: 'Import at or above', unit: 'W', min: 0, max: 100000, step: 100, default: 5000, hysteresis: 200,
    contactHint: 'Open while pulling heavily from the grid',
    describe: ({ value }) => `Importing ${formatWatts(value)} from the grid`
  }),
  threshold({
    type: 'gridExportAbove', label: 'High grid export', group: 'Grid',
    signal: (ctx) => Math.max(0, -ctx.gridPower), comparison: 'above',
    paramLabel: 'Export at or above', unit: 'W', min: 0, max: 100000, step: 100, default: 5000, hysteresis: 200,
    contactHint: 'Open while exporting heavily',
    describe: ({ value }) => `Exporting ${formatWatts(value)} to the grid`
  }),
  threshold({
    type: 'solarAbove', label: 'High solar output', group: 'Solar',
    signal: (ctx) => ctx.pvPower, comparison: 'above',
    paramLabel: 'Solar at or above', unit: 'W', min: 0, max: 100000, step: 100, default: 5000, hysteresis: 200,
    contactHint: 'Open while solar output is high',
    describe: ({ value }) => `Solar is producing ${formatWatts(value)}`
  }),
  threshold({
    type: 'loadAbove', label: 'High home usage', group: 'Home',
    signal: (ctx) => ctx.loadPower, comparison: 'above',
    paramLabel: 'Usage at or above', unit: 'W', min: 0, max: 100000, step: 100, default: 5000, hysteresis: 200,
    contactHint: 'Open while home usage is high',
    describe: ({ value }) => `Home is using ${formatWatts(value)}`
  }),
  threshold({
    type: 'outdoorTempAbove', label: 'Hot outside', group: 'Weather',
    signal: (ctx) => ctx.outdoorTemp, comparison: 'above',
    paramLabel: 'Temperature at or above', unit: '°', min: -50, max: 60, default: 35, hysteresis: 1,
    available: (ctx) => ctx.weatherEnabled,
    contactHint: 'Open while it is hot out',
    describe: ({ value }) => `Outdoor temperature is ${Math.round(value)}°`
  }),
  threshold({
    type: 'outdoorTempBelow', label: 'Cold outside', group: 'Weather',
    signal: (ctx) => ctx.outdoorTemp, comparison: 'below',
    paramLabel: 'Temperature at or below', unit: '°', min: -50, max: 60, default: 2, hysteresis: 1,
    available: (ctx) => ctx.weatherEnabled,
    contactHint: 'Open while it is cold out',
    describe: ({ value }) => `Outdoor temperature is ${Math.round(value)}°`
  }),
  threshold({
    type: 'costRateAbove', label: 'Expensive grid draw', group: 'Cost',
    signal: (ctx) => ctx.costPerHour, comparison: 'above',
    paramLabel: 'Cost per hour at or above', unit: '/h', min: 0, max: 100, step: 0.1, default: 1, hysteresis: 0.1,
    available: (ctx) => ctx.tariffConfigured,
    contactHint: 'Open while the grid is costing a lot',
    describe: ({ value }) => `Grid is costing ${(value ?? 0).toFixed(2)} per hour`
  })
])

const threshold = ({
  type, label, group, unit, signal, comparison,
  min, max, step = 1, default: fallback, hysteresis,
  paramLabel, contactHint, describe,
  available = () => true,
  armMs = THRESHOLD_ARM_MS, clearMs = THRESHOLD_CLEAR_MS
}) => ({
  type,
  label,
  group,
  contactHint,
  available,
  defaultNotify: { raised: true, cleared: false },
  params: [{ key: 'threshold', label: paramLabel, unit, min, max, step, default: fallback }],
  isBad: ({ ctx, params, active }) => {
    const value = signal(ctx)
    if (value == null) return false
    const band = active ? hysteresis : 0
    return comparison === 'below' ? value <= params.threshold + band : value >= params.threshold - band
  },
  describe: ({ ctx, params }) => describe({ value: signal(ctx), threshold: params.threshold }),
  reading: ({ ctx, params }) => ({
    value: roundReading(signal(ctx)),
    comparison: comparisonLabel(comparison),
    threshold: params.threshold,
    unit
  }),
  sample: (params) => ({
    message: describe({ value: params.threshold, threshold: params.threshold }),
    condition: {
      value: params.threshold,
      comparison: comparisonLabel(comparison),
      threshold: params.threshold,
      unit
    }
  }),
  armMs: () => armMs,
  clearMs: () => clearMs
})

const gatewayOffline = {
  type: 'gatewayOffline',
  label: 'Gateway offline',
  group: 'System',
  contactHint: 'Open while the gateway is unreachable',
  available: () => true,
  defaultNotify: { raised: true, cleared: true },
  params: [{ key: 'afterMinutes', label: 'Unreachable for', unit: 'min', min: 1, max: 60, step: 1, default: 3 }],
  isBad: ({ ctx }) => !ctx.connected || ctx.dataAgeMs > STALE_MS,
  describe: () => 'Gateway is not responding',
  reading: ({ ctx, params }) => ({
    value: roundReading(ctx.dataAgeMs / MINUTE_MS),
    comparison: 'atOrAbove',
    threshold: params.afterMinutes,
    unit: 'min'
  }),
  sample: (params) => ({
    message: 'Gateway is not responding',
    condition: { value: params.afterMinutes, comparison: 'atOrAbove', threshold: params.afterMinutes, unit: 'min' }
  }),
  armMs: (params) => params.afterMinutes * MINUTE_MS,
  clearMs: () => OFFLINE_CLEAR_MS
}

const emptyingMinutes = (ctx) =>
  ctx.estimate?.status === 'ready' && ctx.estimate.direction === 'discharge'
    ? ctx.estimate.minutesRemaining
    : null

const formatWatts = (watts) =>
  watts >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${Math.round(watts)} W`

const roundReading = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : null

const comparisonLabel = (direction) => direction === 'below' ? 'atOrBelow' : 'atOrAbove'

let cache = null

const THRESHOLD_ARM_MS = 120000

const THRESHOLD_CLEAR_MS = 120000

const STALE_MS = 120000

const OFFLINE_CLEAR_MS = 30000

const MINUTE_MS = 60000
