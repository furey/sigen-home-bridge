import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ hang: false, timeoutAtConnect: [] }))

vi.mock('modbus-serial', () => ({
  default: class {
    connectTCP () {
      fake.timeoutAtConnect.push(this._timeout)
      return fake.hang ? new Promise(() => {}) : Promise.resolve()
    }
    setID () {}
    setTimeout (timeout) { this._timeout = timeout }
    close (callback) { callback() }
    destroy (callback) { callback() }
    readInputRegisters (address, length) {
      const buffer = Buffer.alloc(length * 2)
      return Promise.resolve({ data: new Array(length).fill(500), buffer })
    }
  }
}))

vi.mock('../settings.js', () => ({ getSettings: () => ({}), onSettingsChange: () => {} }))

vi.mock('../history.js', () => ({ recordSample: () => {} }))

const { testGateway } = await import('../modbus.js')

const target = { host: 'fake', port: 502, unitId: 247 }

describe('testGateway', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fake.timeoutAtConnect.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears its race timer after a quick answer', async () => {
    fake.hang = false
    expect(await testGateway(target)).toEqual({ ok: true, batterySoc: 50 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('applies a connect timeout to the probe', async () => {
    fake.hang = false
    await testGateway(target)
    expect(fake.timeoutAtConnect[0]).toBe(3000)
  })

  it('still reports a timeout when the gateway never answers', async () => {
    fake.hang = true
    const result = testGateway(target)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await result).toEqual({ ok: false, error: 'connection timed out' })
  })
})
