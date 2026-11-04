import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ failReads: false, logged: [] }))

vi.mock('modbus-serial', () => ({
  default: class {
    connectTCP () { return Promise.resolve() }
    setID () {}
    setTimeout () {}
    close (callback) { callback() }
    destroy (callback) { callback() }
    readInputRegisters (address, length) {
      if (fake.failReads) return Promise.reject(new Error('socket closed'))
      const buffer = Buffer.alloc(length * 2)
      return Promise.resolve({ data: new Array(length).fill(500), buffer })
    }
  }
}))

vi.mock('../settings.js', () => ({
  getSettings: () => ({
    sigen: { host: 'fake', port: 502, unitId: 247 },
    poll: { schedule: [], defaultIntervalMs: 1000, reconnectDelayMs: 1000 },
    solar: { stringNames: {} },
    smartLoads: { labels: {} }
  }),
  onSettingsChange: () => {}
}))

vi.mock('../history.js', () => ({ recordSample: () => {} }))

vi.mock('../devices.js', () => ({
  discoverInverters: async () => [],
  readInverter: async () => ({}),
  readSmartLoads: async () => []
}))

const { startModbusPoller } = await import('../modbus.js')

const noneLogs = () => fake.logged.filter((message) => message.includes('no inverters'))

describe('no-inverter log per connection', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation((message) => fake.logged.push(message))
  })

  afterAll(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('logs again after a reconnect finds no inverters', async () => {
    startModbusPoller()
    await vi.advanceTimersByTimeAsync(0)
    expect(noneLogs()).toHaveLength(1)
    fake.failReads = true
    await vi.advanceTimersByTimeAsync(1000)
    fake.failReads = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(noneLogs()).toHaveLength(2)
  })
})
