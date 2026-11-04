import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  events: [],
  readTimeouts: [],
  connectResults: [],
  listeners: [],
  settings: {
    sigen: { host: 'fake', port: 502, unitId: 247 },
    poll: { schedule: [], defaultIntervalMs: 1000, reconnectDelayMs: 1000 },
    solar: { stringNames: {} },
    smartLoads: { labels: {} }
  }
}))

vi.mock('modbus-serial', () => ({
  default: class {
    connectTCP (host) {
      fake.events.push({ type: 'connect', host, timeout: this._timeout })
      const result = fake.connectResults.shift()
      return result ? Promise.reject(new Error(result)) : Promise.resolve()
    }
    setID () {}
    setTimeout (timeout) { this._timeout = timeout }
    close (callback) { fake.events.push({ type: 'close' }); callback() }
    destroy (callback) { fake.events.push({ type: 'destroy' }); callback() }
    readInputRegisters (address, length) {
      fake.readTimeouts.push(this._timeout)
      const buffer = Buffer.alloc(length * 2)
      return Promise.resolve({ data: new Array(length).fill(500), buffer })
    }
  }
}))

vi.mock('../settings.js', () => ({
  getSettings: () => fake.settings,
  onSettingsChange: (listener) => fake.listeners.push(listener)
}))

vi.mock('../history.js', () => ({ recordSample: () => {} }))

vi.mock('../devices.js', () => ({
  discoverInverters: async (client) => {
    client.setTimeout(800)
    return [{ unitId: 1, model: 'X', serial: 'S', stringCount: 0 }]
  },
  readInverter: async () => ({ strings: [] }),
  readSmartLoads: async () => []
}))

const { startModbusPoller } = await import('../modbus.js')
const { state } = await import('../state.js')

const connects = () => fake.events.filter((event) => event.type === 'connect')

const changeSettings = (sigen) => {
  fake.settings = { ...fake.settings, sigen }
  for (const listener of fake.listeners) listener(['sigen'])
}

describe('modbus reconnect', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterAll(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('applies the socket timeout to the first connect attempt', async () => {
    fake.connectResults.push('connect refused')
    startModbusPoller()
    await vi.advanceTimersByTimeAsync(0)
    expect(connects()[0].timeout).toBe(5000)
  })

  it('drops a pending failure retry once a settings reconnect succeeds', async () => {
    changeSettings({ host: 'other', port: 502, unitId: 247 })
    await vi.advanceTimersByTimeAsync(250)
    expect(connects()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(connects()).toHaveLength(2)
  })

  it('releases the existing port before each connect', () => {
    const second = fake.events.indexOf(connects()[1])
    const before = fake.events.slice(0, second)
    expect(before.some((event) => event.type === 'destroy')).toBe(true)
    const lastRelease = before.findLastIndex((event) => event.type === 'destroy')
    const between = before.slice(lastRelease).filter((event) => event.type === 'connect')
    expect(between).toHaveLength(0)
  })

  it('restores the socket timeout after discovery shortens it', () => {
    expect(fake.readTimeouts.length).toBeGreaterThan(0)
    expect(fake.readTimeouts.every((timeout) => timeout === 5000)).toBe(true)
  })

  it('skips the reconnect when the gateway target is unchanged', async () => {
    changeSettings({ host: 'other', port: 502, unitId: 247 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(connects()).toHaveLength(2)
  })

  it('reconnects when the unit ID changes', async () => {
    changeSettings({ host: 'other', port: 502, unitId: 1 })
    await vi.advanceTimersByTimeAsync(250)
    expect(connects()).toHaveLength(3)
  })

  it('retries at once on an unchanged save while disconnected', async () => {
    fake.connectResults.push('connect refused')
    changeSettings({ host: 'other', port: 502, unitId: 2 })
    await vi.advanceTimersByTimeAsync(250)
    expect(connects()).toHaveLength(4)
    expect(state.connected).toBe(false)
    changeSettings({ host: 'other', port: 502, unitId: 2 })
    await vi.advanceTimersByTimeAsync(250)
    expect(connects()).toHaveLength(5)
  })
})
