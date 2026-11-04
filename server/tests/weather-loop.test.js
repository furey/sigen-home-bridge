import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('../settings.js')
  vi.restoreAllMocks()
})

const boot = async ({ fetchMock, weather }) => {
  vi.resetModules()
  const settings = { weather: { enabled: true, latitude: 1, longitude: 2, units: 'celsius', refreshMs: REFRESH_MS, ...weather } }
  const listeners = []
  vi.doMock('../settings.js', () => ({
    getSettings: () => settings,
    onSettingsChange: (listener) => listeners.push(listener)
  }))
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', fetchMock)
  const { state } = await import('../state.js')
  const { startWeather } = await import('../weather.js')
  startWeather()
  const change = (patch) => {
    Object.assign(settings.weather, patch)
    for (const listener of listeners) listener(['weather'])
  }
  return { state, change }
}

const forecast = (temperature) => ({
  ok: true,
  json: async () => ({ current: { temperature_2m: temperature, weather_code: 1 } })
})

describe('weather reload while a poll is in flight', () => {
  it('discards the superseded fetch after the weather is disabled', async () => {
    let resolveFetch = null
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve }))
    const { state, change } = await boot({ fetchMock })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    change({ enabled: false })
    resolveFetch(forecast(30))
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3)
    expect(state.outdoorTemp).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('runs a single poll loop after a reload during a fetch', async () => {
    let resolveFirst = null
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementation(async () => forecast(10))
    const { state, change } = await boot({ fetchMock })
    await vi.advanceTimersByTimeAsync(0)
    change({ latitude: 5 })
    await vi.advanceTimersByTimeAsync(0)
    resolveFirst(forecast(99))
    await vi.advanceTimersByTimeAsync(0)
    expect(state.outdoorTemp).toBe(10)
    const before = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(REFRESH_MS)
    expect(fetchMock.mock.calls.length - before).toBe(1)
  })
})

describe('weather fetch timeout', () => {
  it('passes an abort signal to every forecast request', async () => {
    const fetchMock = vi.fn(async () => forecast(12))
    await boot({ fetchMock })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('passes an abort signal to the IP geolocation request', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'fail', message: 'x' }) }))
    await boot({ fetchMock, weather: { latitude: null, longitude: null } })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('weather staleness', () => {
  it('retries on the short cadence and clears the reading once it goes stale', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(forecast(18))
      .mockResolvedValue({ ok: false, status: 503 })
    const { state } = await boot({ fetchMock })
    await vi.advanceTimersByTimeAsync(0)
    expect(state.outdoorTemp).toBe(18)
    await vi.advanceTimersByTimeAsync(REFRESH_MS + 5000)
    expect(state.outdoorTemp).toBe(18)
    const afterFailure = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(RETRY_MS + 5000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFailure)
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 2)
    expect(state.outdoorTemp).toBeNull()
  })
})

const REFRESH_MS = 600000

const RETRY_MS = 30000
