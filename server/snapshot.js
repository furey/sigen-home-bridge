import { state } from './state.js'
import { getSettings } from './settings.js'
import { getHistoryAll, historyStats } from './history.js'
import { batteryEstimate, dailyCost, netPerHour, tariffConfigured } from './derive.js'

export const buildSnapshot = () => {
  const settings = getSettings()
  const now = new Date()
  const capacityKwh = settings.battery.capacityKwh ?? state.ratedEnergyCapacity
  return {
    schema: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    lastUpdated: state.lastUpdated,
    connected: state.connected,
    pollIntervalMs: state.pollIntervalMs,
    units: units(settings),
    power: power(),
    battery: battery({ capacityKwh, reserveSoc: settings.battery.reserveSoc }),
    energy: energy(),
    ...weatherSection(settings),
    ...tariffSection({ tariff: settings.tariff, now }),
    alerts: state.alerts,
    devices: state.devices,
    history: history()
  }
}

const units = (settings) => ({
  power: 'W',
  energy: 'kWh',
  temperature: settings.weather.units,
  currency: settings.tariff.currency
})

const power = () => ({
  solar: state.pvPower,
  solarSigen: state.sigenPvPower,
  solarThirdParty: state.thirdPartyPvPower,
  home: state.loadPower,
  homeGeneral: state.generalLoadPower,
  grid: state.gridPower,
  battery: state.batteryPower,
  gridDirection: flowDirection(state.gridPower, 'import', 'export'),
  batteryDirection: flowDirection(state.batteryPower, 'charge', 'discharge')
})

const battery = ({ capacityKwh, reserveSoc }) => ({
  soc: state.batterySoc,
  soh: state.batterySoh,
  capacityKwh,
  reserveSoc,
  energyRemainingKwh: capacityKwh == null ? null : round((capacityKwh * state.batterySoc) / 100),
  direction: flowDirection(state.batteryPower, 'charge', 'discharge'),
  estimate: batteryEstimate(getHistoryAll(), { capacityKwh, reserveSoc })
})

const energy = () => ({
  consumedToday: state.consumedToday,
  lifetime: {
    pv: state.lifetimePv,
    consumed: state.lifetimeConsumed,
    gridImport: state.lifetimeGridImport,
    gridExport: state.lifetimeGridExport,
    batteryCharge: state.lifetimeBatteryCharge,
    batteryDischarge: state.lifetimeBatteryDischarge
  }
})

const weatherSection = (settings) =>
  settings.weather.enabled
    ? {
        weather: {
          outdoorTemp: state.outdoorTemp,
          weatherCode: state.weatherCode,
          location: state.outdoorLocation,
          latitude: state.outdoorLatitude,
          longitude: state.outdoorLongitude
        }
      }
    : {}

const tariffSection = ({ tariff, now }) =>
  tariffConfigured(tariff)
    ? {
        tariff: {
          currency: tariff.currency,
          netPerHour: round(netPerHour({ tariff, gridWatts: state.gridPower ?? 0, now })),
          today: roundValues(dailyCost({ samples: getHistoryAll(), tariff, now }))
        }
      }
    : {}

const history = () => ({
  ...historyStats(),
  links: { recent: '/api/history', export: '/api/history/export?format=json&every=300' }
})

const flowDirection = (watts, positive, negative) => {
  if (watts == null) return null
  if (Math.abs(watts) < FLOW_IDLE_WATTS) return 'idle'
  return watts > 0 ? positive : negative
}

const roundValues = (values) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) =>
      [key, typeof value === 'number' ? round(value) : value]))

const round = (value) => (value == null ? value : Math.round(value * ROUND_FACTOR) / ROUND_FACTOR)

const SCHEMA_VERSION = 1

const ROUND_FACTOR = 10000

const FLOW_IDLE_WATTS = 5
