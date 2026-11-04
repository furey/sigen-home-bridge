import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-trigger-units', import.meta.url))

process.env.DATA_DIR = dataDir
process.env.WEATHER_UNITS = 'celsius'

const { loadSettings, updateSettings, publicSettings } = await import('../settings.js')

beforeAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
  loadSettings()
})

const temperatureParam = (type) =>
  publicSettings().alertTriggers.find((trigger) => trigger.type === type).params[0]

const thresholdOf = (settings, id) =>
  settings.alerts.items.find((item) => item.id === id).trigger.threshold

const alert = (id, type, threshold) => ({ id, name: id, enabled: true, trigger: { type, threshold } })

describe('outdoor temperature trigger units', () => {
  it('publishes Celsius ranges and defaults for Celsius weather', () => {
    expect(temperatureParam('outdoorTempAbove')).toMatchObject({ min: -50, max: 60, default: 35 })
    expect(temperatureParam('outdoorTempBelow')).toMatchObject({ min: -50, max: 60, default: 2 })
  })

  it('converts existing thresholds when the weather units change', () => {
    updateSettings({
      alerts: {
        items: [
          alert('hot', 'outdoorTempAbove', 35),
          alert('cold', 'outdoorTempBelow', 2),
          alert('flat', 'batteryBelow', 15)
        ]
      }
    })
    const fahrenheit = updateSettings({ weather: { units: 'fahrenheit' } })
    expect(thresholdOf(fahrenheit, 'hot')).toBe(95)
    expect(thresholdOf(fahrenheit, 'cold')).toBe(36)
    expect(thresholdOf(fahrenheit, 'flat')).toBe(15)
    const celsius = updateSettings({ weather: { units: 'celsius' } })
    expect(thresholdOf(celsius, 'hot')).toBe(35)
    expect(thresholdOf(celsius, 'cold')).toBe(2)
  })

  it('publishes Fahrenheit ranges and defaults for Fahrenheit weather', () => {
    updateSettings({ weather: { units: 'fahrenheit' } })
    expect(temperatureParam('outdoorTempAbove')).toMatchObject({ min: -58, max: 140, default: 95 })
    expect(temperatureParam('outdoorTempBelow')).toMatchObject({ min: -58, max: 140, default: 36 })
  })

  it('accepts a Fahrenheit threshold above the Celsius maximum', () => {
    const { alerts } = updateSettings({ alerts: { items: [alert('heat', 'outdoorTempAbove', 104)] } })
    expect(alerts.items[0].trigger.threshold).toBe(104)
  })

  it('rejects a Fahrenheit threshold outside the Fahrenheit range', () => {
    expect(() => updateSettings({ alerts: { items: [alert('heat', 'outdoorTempAbove', 150)] } }))
      .toThrow(/between -58 and 140/)
  })
})
