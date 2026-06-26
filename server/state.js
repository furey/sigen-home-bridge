export const state = {
  pvPower: 0,
  sigenPvPower: 0,
  thirdPartyPvPower: 0,
  gridPower: 0,
  batteryPower: 0,
  batterySoc: 0,
  batterySoh: null,
  loadPower: 0,
  generalLoadPower: null,
  ratedEnergyCapacity: null,
  consumedToday: null,
  lifetimePv: null,
  lifetimeConsumed: null,
  lifetimeGridImport: null,
  lifetimeGridExport: null,
  lifetimeBatteryCharge: null,
  lifetimeBatteryDischarge: null,
  outdoorTemp: null,
  weatherCode: null,
  outdoorLocation: null,
  outdoorLatitude: null,
  outdoorLongitude: null,
  lastUpdated: null,
  pollIntervalMs: null,
  connected: false,
  alerts: [],
  devices: []
}

export const subscribe = (listener) => {
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

export const publish = () => {
  for (const listener of subscribers) listener(state)
}

const subscribers = new Set()
