import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_DIR = fileURLToPath(new URL('../../tmp/test-data-homekit', import.meta.url))

const hap = vi.hoisted(() => {
  const { EventEmitter } = require('node:events')
  const services = []
  const bridges = []
  const publish = { impl: async () => {} }
  const characteristic = (name) => ({ name })
  const Characteristic = {
    Manufacturer: characteristic('Manufacturer'),
    Model: characteristic('Model'),
    SerialNumber: characteristic('SerialNumber'),
    CurrentTemperature: characteristic('CurrentTemperature'),
    CurrentRelativeHumidity: characteristic('CurrentRelativeHumidity'),
    BatteryLevel: characteristic('BatteryLevel'),
    StatusLowBattery: { name: 'StatusLowBattery', BATTERY_LEVEL_LOW: 1, BATTERY_LEVEL_NORMAL: 0 },
    StatusFault: { name: 'StatusFault', NO_FAULT: 0, GENERAL_FAULT: 1 },
    ContactSensorState: { name: 'ContactSensorState', CONTACT_DETECTED: 0, CONTACT_NOT_DETECTED: 1 }
  }
  const makeService = (type, label) => {
    const service = {
      type,
      label,
      added: [],
      values: new Map(),
      setPrimaryService: () => {},
      addCharacteristic: (char) => service.added.push(char.name),
      getCharacteristic: () => ({ setProps: () => {} }),
      setCharacteristic: () => service,
      updateCharacteristic: (char, value) => service.values.set(char.name, value)
    }
    services.push(service)
    return service
  }
  class Accessory {
    getService () { return makeService('AccessoryInformation') }
    addService (type, label) { return makeService(type, label) }
  }
  class Bridge extends EventEmitter {
    constructor () {
      super()
      bridges.push(this)
    }

    addBridgedAccessory () {}
    publish (options) { return publish.impl(options) }
    setupURI () { return 'X-HM://TEST' }
  }
  return {
    services,
    bridges,
    publish,
    module: {
      Accessory,
      Bridge,
      Categories: { BRIDGE: 2 },
      Characteristic,
      HAPStorage: { setCustomStoragePath: () => {} },
      MDNSAdvertiser: { CIAO: 'ciao' },
      Service: {
        AccessoryInformation: 'AccessoryInformation',
        HumiditySensor: 'HumiditySensor',
        Battery: 'Battery',
        TemperatureSensor: 'TemperatureSensor',
        ContactSensor: 'ContactSensor'
      },
      uuid: { generate: (seed) => seed }
    }
  }
})

vi.mock('hap-nodejs', () => hap.module)

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  hap.services.length = 0
  hap.bridges.length = 0
  hap.publish.impl = async () => {}
})

afterAll(() => rmSync(process.env.DATA_DIR, { recursive: true, force: true }))

const freePort = async () => {
  const server = await occupyPort()
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

const start = async ({ port } = {}) => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const { updateSettings } = await import('../settings.js')
  updateSettings({ homekit: { port: port ?? await freePort() } })
  const { state } = await import('../state.js')
  const homekit = await import('../homekit.js')
  return { state, homekit }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

const occupyPort = () => new Promise((resolve) => {
  const server = createServer().listen(0, () => resolve(server))
})

describe('homekit publish failure', () => {
  it('does not announce a pairing QR when publish rejects', async () => {
    hap.publish.impl = async () => { throw new Error('bind failed') }
    const { homekit } = await start()
    homekit.startHomeKit()
    await settle()
    const pairing = homekit.getPairing()
    expect(pairing.qr).toBe('')
    expect(pairing.uri).toBe('')
    expect(pairing.error).toMatch(/bind failed/)
  })

  it('does not publish or announce when the HomeKit port is already taken', async () => {
    const blocker = await occupyPort()
    const published = vi.fn(async () => {})
    hap.publish.impl = published
    try {
      const { homekit } = await start({ port: blocker.address().port })
      homekit.startHomeKit()
      await settle()
      expect(published).not.toHaveBeenCalled()
      expect(homekit.getPairing().qr).toBe('')
      expect(homekit.getPairing().error).toMatch(/EADDRINUSE/)
    } finally {
      await new Promise((resolve) => blocker.close(resolve))
    }
  })

  it('waits for the mDNS advertisement before announcing the pairing QR', async () => {
    const { homekit } = await start()
    homekit.startHomeKit()
    await settle()
    expect(homekit.getPairing().qr).toBe('')
    hap.bridges[0].emit('advertised')
    const pairing = homekit.getPairing()
    expect(pairing.uri).toBe('X-HM://TEST')
    expect(pairing.qr).toMatch(/^data:image\/svg\+xml/)
    expect(pairing.error).toBeUndefined()
  })
})

describe('homekit power sensors while disconnected', () => {
  it('flags every power sensor with a general fault', async () => {
    const { state, homekit } = await start()
    state.connected = false
    homekit.startHomeKit()
    await settle()
    const sensors = hap.services.filter((service) => service.type === 'TemperatureSensor')
    expect(sensors.length).toBeGreaterThan(0)
    for (const sensor of sensors) {
      expect(sensor.added).toContain('StatusFault')
      expect(sensor.values.get('StatusFault')).toBe(1)
    }
  })
})
