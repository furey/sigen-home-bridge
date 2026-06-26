import { reactive } from 'vue'

export const DEFAULT_TITLE = 'Sigen Home Bridge'

export const DEFAULT_METRIC_SCALE = 0.65

export const DEFAULT_POWER_UNIT = 'kW'

export const DEFAULT_POWER_DECIMALS = 2

export const POWER_UNITS = ['kW', 'W']

export const THEME_PRESETS = [
  {
    key: 'default',
    label: 'Default',
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
  },
  {
    key: 'ember',
    label: 'Ember',
    colors: {
      solarAccent: '#f97316',
      solarLow: '#7c2d12',
      solarMid: '#ea580c',
      solarHigh: '#fdba74',
      socHigh: '#fbbf24',
      socMedium: '#fb923c',
      socLow: '#dc2626',
      gridImport: '#fca5a5',
      gridExport: '#991b1b',
      batteryCharge: '#be123c',
      batteryDischarge: '#fb7185',
      home: '#fef3c7',
      idle: '#78716c',
      cost: '#dc2626',
      credit: '#fbbf24'
    }
  },
  {
    key: 'ocean',
    label: 'Ocean',
    colors: {
      solarAccent: '#2dd4bf',
      solarLow: '#115e59',
      solarMid: '#14b8a6',
      solarHigh: '#5eead4',
      socHigh: '#34d399',
      socMedium: '#fbbf24',
      socLow: '#fb7185',
      gridImport: '#7dd3fc',
      gridExport: '#1d4ed8',
      batteryCharge: '#6366f1',
      batteryDischarge: '#a5b4fc',
      home: '#e0f2fe',
      idle: '#64748b',
      cost: '#fb7185',
      credit: '#34d399'
    }
  },
  {
    key: 'mono',
    label: 'Mono',
    colors: {
      solarAccent: '#d4d4d8',
      solarLow: '#52525b',
      solarMid: '#a1a1aa',
      solarHigh: '#f4f4f5',
      socHigh: '#e4e4e7',
      socMedium: '#a1a1aa',
      socLow: '#52525b',
      gridImport: '#d4d4d8',
      gridExport: '#71717a',
      batteryCharge: '#a1a1aa',
      batteryDischarge: '#e4e4e7',
      home: '#fafafa',
      idle: '#52525b',
      cost: '#d4d4d8',
      credit: '#f4f4f5'
    }
  }
]

export const DEFAULT_COLORS = THEME_PRESETS[0].colors

export const themeColors = reactive({ ...DEFAULT_COLORS })

export const displayPrefs = reactive({
  powerUnit: DEFAULT_POWER_UNIT,
  powerDecimals: DEFAULT_POWER_DECIMALS
})

export const applyAppearance = (appearance) => {
  Object.assign(themeColors, DEFAULT_COLORS, sanitize(appearance?.theme?.colors))
  displayPrefs.powerUnit = POWER_UNITS.includes(appearance?.powerUnit)
    ? appearance.powerUnit
    : DEFAULT_POWER_UNIT
  displayPrefs.powerDecimals = powerDecimalsOf(appearance)
  document.title = appearance?.title?.trim() || DEFAULT_TITLE
  document.documentElement.style.setProperty('--metric-scale', metricScaleOf(appearance))
}

const powerDecimalsOf = (appearance) => {
  const decimals = Number(appearance?.powerDecimals)
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 3
    ? decimals
    : DEFAULT_POWER_DECIMALS
}

const metricScaleOf = (appearance) => {
  const scale = Number(appearance?.metricScale)
  return Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_METRIC_SCALE
}

export const presetMatching = (colors) =>
  THEME_PRESETS.find((preset) =>
    Object.entries(preset.colors).every(([key, hex]) => sameHex(colors[key], hex)))

export const isHexColor = (value) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

const sanitize = (colors = {}) =>
  Object.fromEntries(
    Object.entries(colors).filter(([key, hex]) => key in DEFAULT_COLORS && isHexColor(hex)))

const sameHex = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
