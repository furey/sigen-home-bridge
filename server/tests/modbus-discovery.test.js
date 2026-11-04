import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ discoveries: 0, found: [], logged: [] }))

vi.mock('modbus-serial', () => ({
  default: class {
    connectTCP () { return Promise.resolve() }
    setID () {}
    setTimeout () {}
    close (callback) { callback() }
    destroy (callback) { callback() }
    readInputRegisters (address, length) {
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
  discoverInverters: async () => {
    fake.discoveries++
    return fake.found
  },
  readInverter: async (client, device) =>
    ({ type: 'inverter', unitId: device.unitId, strings: [] }),
  readSmartLoads: async () => []
}))

const { startModbusPoller } = await import('../modbus.js')
const { state } = await import('../state.js')

const minutes = (count) => count * 60_000

const noneLogs = () => fake.logged.filter((message) => message.includes('no inverters'))

describe('inverter discovery retry', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation((message) => fake.logged.push(message))
  })

  afterAll(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('logs once when discovery finds no inverters', async () => {
    startModbusPoller()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.discoveries).toBe(1)
    expect(noneLogs()).toHaveLength(1)
  })

  it('retries discovery after a minute while nothing is found', async () => {
    await vi.advanceTimersByTimeAsync(minutes(1) - 2000)
    expect(fake.discoveries).toBe(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fake.discoveries).toBe(2)
    expect(noneLogs()).toHaveLength(1)
  })

  it('doubles the retry delay', async () => {
    await vi.advanceTimersByTimeAsync(minutes(2) - 2000)
    expect(fake.discoveries).toBe(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fake.discoveries).toBe(3)
  })

  it('caps the retry delay at fifteen minutes', async () => {
    await vi.advanceTimersByTimeAsync(minutes(4 + 8 + 15 + 15) + 1000)
    expect(fake.discoveries).toBe(7)
  })

  it('stops retrying once an inverter is found and reads it', async () => {
    fake.found = [{ unitId: 1, model: 'X', serial: 'S', stringCount: 0 }]
    await vi.advanceTimersByTimeAsync(minutes(15))
    const discoveries = fake.discoveries
    expect(state.devices.some((device) => device.type === 'inverter')).toBe(true)
    await vi.advanceTimersByTimeAsync(minutes(60))
    expect(fake.discoveries).toBe(discoveries)
  })
})
