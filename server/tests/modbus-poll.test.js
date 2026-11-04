import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ failures: new Map(), reads: [] }))

vi.mock('modbus-serial', () => ({
  default: class {
    connectTCP () { return Promise.resolve() }
    setID () {}
    setTimeout () {}
    close (callback) { callback() }
    readInputRegisters (address, length) {
      fake.reads.push(address)
      const code = fake.failures.get(address)
      if (code) {
        const error = new Error(`Modbus exception ${code}: test`)
        error.modbusCode = code
        return Promise.reject(error)
      }
      return Promise.resolve({ data: new Array(length).fill(500), buffer: wattsBuffer(length, 1000) })
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

const { deriveBatteryPower, startModbusPoller } = await import('../modbus.js')
const { state } = await import('../state.js')

const LOAD_POWER_ADDRESS = 30284

const GRID_POWER_ADDRESS = 30005

const wattsBuffer = (length, watts) => {
  const buffer = Buffer.alloc(length * 2)
  if (length >= 2) buffer.writeInt32BE(watts, 0)
  return buffer
}

const readsOf = (address) => fake.reads.filter((read) => read === address).length

describe('deriveBatteryPower', () => {
  it('returns null when an input is missing', () => {
    expect(deriveBatteryPower({ pvPower: 1000, gridPower: 0, loadPower: undefined })).toBeNull()
  })

  it('returns null when an input is not finite', () => {
    expect(deriveBatteryPower({ pvPower: NaN, gridPower: 0, loadPower: 500 })).toBeNull()
  })
})

describe('modbus poll exceptions', () => {
  const logged = []

  beforeAll(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation((message) => logged.push(message))
  })

  afterAll(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the previous value through a transient exception and retries next poll', async () => {
    state.loadPower = 999
    fake.failures.set(LOAD_POWER_ADDRESS, 6)
    startModbusPoller()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.connected).toBe(true)
    expect(state.loadPower).toBe(999)
    expect(state.batteryPower).toBe(2001)
    fake.failures.clear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.loadPower).toBe(1000)
    expect(state.batteryPower).toBe(2000)
  })

  it('marks a register unsupported only on illegal function or address', async () => {
    fake.failures.set(LOAD_POWER_ADDRESS, 2)
    await vi.advanceTimersByTimeAsync(1000)
    const readsAfterUnsupported = readsOf(LOAD_POWER_ADDRESS)
    await vi.advanceTimersByTimeAsync(1000)
    expect(readsOf(LOAD_POWER_ADDRESS)).toBe(readsAfterUnsupported)
    expect(state.loadPower).toBeNull()
    expect(state.batteryPower).toBeNull()
  })

  it('keeps the last value for at most three consecutive transient failures', async () => {
    const pollOnce = () => vi.advanceTimersByTimeAsync(1000)
    fake.failures.set(GRID_POWER_ADDRESS, 6)
    for (let failure = 1; failure <= 3; failure++) {
      await pollOnce()
      expect(state.gridPower).toBe(1000)
    }
    await pollOnce()
    expect(state.gridPower).toBeNull()
    fake.failures.delete(GRID_POWER_ADDRESS)
    await pollOnce()
    expect(state.gridPower).toBe(1000)
    fake.failures.set(GRID_POWER_ADDRESS, 6)
    await pollOnce()
    expect(state.gridPower).toBe(1000)
    fake.failures.delete(GRID_POWER_ADDRESS)
    await pollOnce()
  })

  it('logs a dash for a missing power reading', () => {
    const latest = logged.filter((message) => message.includes('[poll]')).at(-1)
    expect(latest).toContain('Bat: - |')
    expect(latest).toContain('Load: - |')
  })
})
