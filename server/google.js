import { getSettings } from './settings.js'
import { GOOGLE_METRICS } from './config.js'
import { state } from './state.js'
import { socPercent } from './derive.js'

export const handleIntent = (body) => {
  const requestId = body?.requestId ?? ''
  const intent = body?.inputs?.[0]?.intent
  if (intent === 'action.devices.SYNC') return syncResponse(requestId)
  if (intent === 'action.devices.QUERY') return queryResponse(requestId)
  if (intent === 'action.devices.EXECUTE') return executeResponse(requestId, body)
  if (intent === 'action.devices.DISCONNECT') return {}
  return { requestId, payload: { errorCode: 'notSupported' } }
}

export const DEVICES = GOOGLE_METRICS

const syncResponse = (requestId) => ({
  requestId,
  payload: { agentUserId: AGENT_USER_ID, devices: DEVICES.map(syncDevice) }
})

const queryResponse = (requestId) => ({
  requestId,
  payload: { devices: Object.fromEntries(DEVICES.map((device) => [device.key, deviceState(device)])) }
})

const executeResponse = (requestId, body) => ({
  requestId,
  payload: { commands: [{ ids: commandIds(body), status: 'SUCCESS', states: { online: true } }] }
})

const syncDevice = ({ key }) => {
  const label = nameFor(key)
  const render = renderFor(key)
  return {
    id: key,
    type: 'action.devices.types.SENSOR',
    traits: [render.trait],
    name: { name: label },
    willReportState: true,
    attributes: render.attributes(label)
  }
}

const deviceState = ({ key }) => ({
  online: true,
  status: 'SUCCESS',
  ...renderFor(key).state(state[key], nameFor(key))
})

const renderFor = (key) => {
  const { powerUnit, batteryDisplay } = getSettings().google
  if (key === 'batterySoc') return BATTERY_RENDERS[batteryDisplay]
  return POWER_RENDERS[powerUnit]
}

const nameFor = (key) =>
  getSettings().google.labels?.[key]?.trim() ||
    GOOGLE_METRICS.find((metric) => metric.key === key).defaultName

const energyStorageRender = {
  trait: 'action.devices.traits.EnergyStorage',
  attributes: () => ({ queryOnlyEnergyStorage: true, isRechargeable: true }),
  state: (soc) => ({
    descriptiveCapacityRemaining: descriptiveCapacity(soc),
    capacityRemaining: [{ rawValue: socPercent(soc), unit: 'PERCENTAGE' }],
    isCharging: (state.batteryPower ?? 0) > CHARGE_THRESHOLD_WATTS,
    isPluggedIn: true
  })
}

const temperatureRender = (toReading) => ({
  trait: 'action.devices.traits.TemperatureControl',
  attributes: () => TEMPERATURE_ATTRIBUTES,
  state: (value) => ({ temperatureAmbientCelsius: toReading(value) })
})

const sensorRender = (unit) => ({
  trait: 'action.devices.traits.SensorState',
  attributes: (label) => ({
    sensorStatesSupported: [{ name: label, numericCapabilities: { rawValueUnit: unit } }]
  }),
  state: (value, label) => ({ currentSensorStateData: [{ name: label, rawValue: Math.round(value ?? 0) }] })
})

const BATTERY_RENDERS = {
  tile: energyStorageRender,
  reading: temperatureRender((soc) => socPercent(soc))
}

const POWER_RENDERS = {
  watts: temperatureRender((watts) => Math.round(watts ?? 0)),
  kilowatts: temperatureRender((watts) => Math.round((watts ?? 0) / 100) / 10),
  hidden: sensorRender('WATTS')
}

const descriptiveCapacity = (soc) =>
  soc < 5 ? 'CRITICALLY_LOW'
    : soc < 20 ? 'LOW'
      : soc < 60 ? 'MEDIUM'
        : soc < 90 ? 'HIGH'
          : 'FULL'

const commandIds = (body) =>
  body?.inputs?.[0]?.payload?.commands?.flatMap((command) =>
    command.devices.map((device) => device.id)) ?? []

const TEMPERATURE_ATTRIBUTES = {
  queryOnlyTemperatureControl: true,
  temperatureUnitForUX: 'C',
  temperatureRange: { minThresholdCelsius: -100000, maxThresholdCelsius: 100000 }
}

const CHARGE_THRESHOLD_WATTS = 50

const AGENT_USER_ID = 'sigen-home-bridge'
