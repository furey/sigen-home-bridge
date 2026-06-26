import {
  ArrowDown, ArrowUp, Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium,
  Cable, House, Sun, Zap
} from '@lucide/vue'
import { displayPrefs, themeColors } from './theme.js'

export const METRICS = [
  {
    key: 'pvPower',
    slug: 'solar',
    label: 'Solar Production',
    get unit() { return displayPrefs.powerUnit },
    icon: Sun,
    glyphGap: 'calc(var(--mu) * 1)',
    get accent() { return themeColors.solarAccent },
    format: (value) => formatPower(value),
    accentFor: (value) => solarColor(value)
  },
  {
    key: 'batterySoc',
    slug: 'battery-percent',
    label: 'Battery',
    unit: '%',
    icon: Battery,
    iconFor: ({ batterySoc, batteryPower }) => batteryIcon({ soc: batterySoc, power: batteryPower }),
    glyphGap: 'calc(var(--mu) * 0.5)',
    get accent() { return themeColors.socHigh },
    format: (value) => `${Math.round(value)}`,
    accentFor: (value) => socColor(value)
  },
  {
    key: 'gridPower',
    slug: 'grid',
    label: 'Grid',
    get unit() { return displayPrefs.powerUnit },
    icon: Cable,
    glyphGap: 'calc(var(--mu) * 1.5)',
    get accent() { return themeColors.gridImport },
    format: (value) => formatPower(value),
    accentFor: (value) => flowColor(value, FLOW_SHADES.gridPower),
    directionFor: (value) => direction(value, 'Importing', 'Exporting')
  },
  {
    key: 'batteryPower',
    slug: 'battery-power',
    label: 'Battery Power',
    get unit() { return displayPrefs.powerUnit },
    icon: Zap,
    glyphGap: 'calc(var(--mu) * 0.5)',
    get accent() { return themeColors.batteryCharge },
    format: (value) => formatPower(value),
    accentFor: (value) => flowColor(value, FLOW_SHADES.batteryPower),
    directionFor: (value) => direction(value, 'Charging', 'Discharging')
  },
  {
    key: 'loadPower',
    slug: 'home',
    label: 'Home Consumption',
    get unit() { return displayPrefs.powerUnit },
    icon: House,
    glyphGap: 'calc(var(--mu) * 1.5)',
    get accent() { return themeColors.home },
    format: (value) => formatPower(value)
  }
]

export const FLOW_SHADES = {
  gridPower: {
    get positive() { return themeColors.gridImport },
    get negative() { return themeColors.gridExport }
  },
  batteryPower: {
    get positive() { return themeColors.batteryCharge },
    get negative() { return themeColors.batteryDischarge }
  }
}

export const metricByKey = (key) => METRICS.find((metric) => metric.key === key)

export const metricBySlug = (slug) => METRICS.find((metric) => metric.slug === slug)

export const accentFor = (metric, value) => {
  if (isDisplayZero(metric, value)) return themeColors.idle
  return metric.accentFor ? metric.accentFor(value) : metric.accent
}

export const categoryAccentFor = (metric, value) => {
  const color = metric.accentFor ? metric.accentFor(value) : metric.accent
  return color === themeColors.idle ? metric.accent : color
}

export const iconFor = (metric, state) => (metric.iconFor ? metric.iconFor(state) : metric.icon)

export const directionFor = (metric, value) => {
  if (!metric.directionFor) return ''
  if (isDisplayZero(metric, value)) return 'Idle'
  return metric.directionFor(value)
}

export const flowIconFor = (metric, value) => {
  if (!metric.directionFor || isDisplayZero(metric, value)) return null
  return value > 0 ? ArrowDown : ArrowUp
}

export const flowAccentFor = (metric, value) =>
  lerpHex(accentFor(metric, value), '#000000', FLOW_ARROW_DIM)

export const FLOW_ARROW_DIM = 0.4

export const formatPower = (watts, { signed = false } = {}) => {
  const value = signed ? watts : Math.abs(watts)
  if (displayPrefs.powerUnit === 'W') return `${Math.round(value)}`
  return (value / 1000).toFixed(displayPrefs.powerDecimals)
}

const isDisplayZero = (metric, value) => Number(metric.format(value)) === 0

const solarRamp = () => [
  { at: 0, hex: themeColors.solarLow },
  { at: 2500, hex: themeColors.solarMid },
  { at: 5000, hex: themeColors.solarHigh }
]

const solarColor = (watts) => rampColor(Math.abs(watts), solarRamp())

const rampColor = (value, stops) => {
  if (value <= stops[0].at) return stops[0].hex
  const last = stops[stops.length - 1]
  if (value >= last.at) return last.hex
  const upper = stops.findIndex((stop) => stop.at > value)
  const lower = stops[upper - 1]
  const next = stops[upper]
  const ratio = (value - lower.at) / (next.at - lower.at)
  return lerpHex(lower.hex, next.hex, ratio)
}

export const lerpHex = (from, to, ratio) => {
  const mix = (start, end) => Math.round(start + (end - start) * ratio)
  const [fr, fg, fb] = channels(from)
  const [tr, tg, tb] = channels(to)
  return `rgb(${mix(fr, tr)}, ${mix(fg, tg)}, ${mix(fb, tb)})`
}

const channels = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))

const flowColor = (value, { positive, negative }) => {
  if (value > 0) return positive
  if (value < 0) return negative
  return themeColors.idle
}

const socColor = (value) => {
  if (value >= 50) return themeColors.socHigh
  if (value >= 10) return themeColors.socMedium
  if (value >= 1) return themeColors.socLow
  return themeColors.idle
}

const batteryIcon = ({ soc = 0, power = 0 }) => {
  if (power >= CHARGING_WATTS) return BatteryCharging
  if (soc >= 66) return BatteryFull
  if (soc >= 33) return BatteryMedium
  if (soc >= 10) return BatteryLow
  return Battery
}

const CHARGING_WATTS = 5

const direction = (value, positive, negative) => {
  if (value > 0) return positive
  if (value < 0) return negative
  return 'Idle'
}
