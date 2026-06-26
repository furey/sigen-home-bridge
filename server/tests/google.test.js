import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

process.env.DATA_DIR = fileURLToPath(new URL('../../tmp/test-data-google', import.meta.url))

const { handleIntent } = await import('../google.js')
const { updateSettings, resetSettings } = await import('../settings.js')

afterEach(() => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  resetSettings()
})

const intent = (name, payload) => ({ requestId: 'r1', inputs: [{ intent: name, payload }] })
const syncDevices = () => handleIntent(intent('action.devices.SYNC')).payload.devices
const device = (id) => syncDevices().find((entry) => entry.id === id)
const states = () => handleIntent(intent('action.devices.QUERY')).payload.devices

describe('handleIntent', () => {
  it('SYNC reports five sensor devices', () => {
    const response = handleIntent(intent('action.devices.SYNC'))
    expect(response.requestId).toBe('r1')
    expect(response.payload.devices).toHaveLength(5)
    expect(response.payload.devices.every((entry) =>
      entry.type === 'action.devices.types.SENSOR')).toBe(true)
  })

  it('defaults the battery to the EnergyStorage tile', () => {
    const battery = device('batterySoc')
    expect(battery.traits).toContain('action.devices.traits.EnergyStorage')
    expect(battery.attributes.queryOnlyEnergyStorage).toBe(true)
  })

  it('defaults power metrics to query-only TemperatureControl in watts', () => {
    const solar = device('pvPower')
    expect(solar.traits).toContain('action.devices.traits.TemperatureControl')
    expect(solar.attributes.queryOnlyTemperatureControl).toBe(true)
    expect(states().pvPower).toHaveProperty('temperatureAmbientCelsius')
  })

  it('SYNC names devices from the configured labels', () => {
    updateSettings({ google: { labels: { pvPower: 'Rooftop Solar' } } })
    expect(device('pvPower').name.name).toBe('Rooftop Solar')
  })

  it('battery reading mode swaps to temperature so voice speaks the number', () => {
    updateSettings({ google: { batteryDisplay: 'reading' } })
    expect(device('batterySoc').traits).toContain('action.devices.traits.TemperatureControl')
    expect(states().batterySoc).toHaveProperty('temperatureAmbientCelsius')
  })

  it('power kilowatts mode scales the reading', () => {
    updateSettings({ google: { powerUnit: 'kilowatts' } })
    expect(device('pvPower').traits).toContain('action.devices.traits.TemperatureControl')
  })

  it('power hidden mode falls back to the blank SensorState trait', () => {
    updateSettings({ google: { powerUnit: 'hidden' } })
    expect(device('pvPower').traits).toContain('action.devices.traits.SensorState')
    expect(states().pvPower).toHaveProperty('currentSensorStateData')
  })

  it('QUERY returns a state entry per device', () => {
    const response = handleIntent(intent('action.devices.QUERY'))
    expect(Object.keys(response.payload.devices)).toHaveLength(5)
    expect(response.payload.devices.batterySoc.online).toBe(true)
  })

  it('EXECUTE is a no-op success for read-only sensors', () => {
    const response = handleIntent(intent('action.devices.EXECUTE', {
      commands: [{ devices: [{ id: 'pvPower' }], execution: [] }]
    }))
    expect(response.payload.commands[0].status).toBe('SUCCESS')
    expect(response.payload.commands[0].ids).toEqual(['pvPower'])
  })

  it('rejects unknown intents', () => {
    expect(handleIntent(intent('action.devices.UNKNOWN')).payload.errorCode).toBe('notSupported')
  })
})
