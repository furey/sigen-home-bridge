import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildForecastUrl, pickCurrent, testWeather } from '../weather.js'

describe('buildForecastUrl', () => {
  it('targets the Open-Meteo current-conditions endpoint', () => {
    const url = new URL(buildForecastUrl({ latitude: 40.71, longitude: -74.01, units: 'celsius' }))
    expect(`${url.origin}${url.pathname}`).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('40.71')
    expect(url.searchParams.get('longitude')).toBe('-74.01')
    expect(url.searchParams.get('current')).toBe('temperature_2m,weather_code')
    expect(url.searchParams.get('temperature_unit')).toBe('celsius')
  })

  it('passes the requested unit through', () => {
    const url = new URL(buildForecastUrl({ latitude: 0, longitude: 0, units: 'fahrenheit' }))
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit')
  })
})

describe('pickCurrent', () => {
  it('extracts temperature and weather code', () => {
    expect(pickCurrent({ current: { temperature_2m: 16.7, weather_code: 1 } }))
      .toEqual({ outdoorTemp: 16.7, weatherCode: 1 })
  })

  it('returns nulls when the current block is missing', () => {
    expect(pickCurrent({})).toEqual({ outdoorTemp: null, weatherCode: null })
    expect(pickCurrent(undefined)).toEqual({ outdoorTemp: null, weatherCode: null })
  })
})

describe('testWeather', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports the temperature and a coordinate label for pinned coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ current: { temperature_2m: 12.3, weather_code: 2 } })
    })))
    expect(await testWeather({ latitude: 53.349, longitude: -6.26, units: 'celsius' }))
      .toEqual({ ok: true, location: '53.35, -6.26', temperature: 12.3, units: 'celsius' })
  })

  it('reports an error when the forecast request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    const result = await testWeather({ latitude: 1, longitude: 2, units: 'celsius' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('503')
  })
})
