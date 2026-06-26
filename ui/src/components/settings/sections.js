import {
  BatteryCharging, BellRing, Cable, CircleDollarSign, Cloud, History, House, LayoutDashboard, Lock,
  Palette, Server, Thermometer
} from '@lucide/vue'

export const SETTINGS_SECTIONS = [
  { name: 'settings-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'settings-gateway', label: 'Gateway', icon: Cable },
  { name: 'settings-battery', label: 'Battery', icon: BatteryCharging },
  { name: 'settings-alerts', label: 'Alerts', icon: BellRing },
  { name: 'settings-tariff', label: 'Tariff', icon: CircleDollarSign },
  { name: 'settings-weather', label: 'Weather', icon: Thermometer },
  { name: 'settings-theme', label: 'Theme', icon: Palette },
  { name: 'settings-apple-home', label: 'Apple Home', icon: House },
  { name: 'settings-google-home', label: 'Google Home', icon: Cloud },
  { name: 'settings-history', label: 'History', icon: History },
  { name: 'settings-security', label: 'Security', icon: Lock },
  { name: 'settings-system', label: 'System', icon: Server }
]
