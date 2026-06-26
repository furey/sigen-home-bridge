import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-snapshot', import.meta.url))

process.env.DATA_DIR = dataDir
process.env.WEATHER_ENABLED = 'true'

const { buildSnapshot } = await import('../snapshot.js')
const { state } = await import('../state.js')
const { loadSettings, updateSettings } = await import('../settings.js')

const baseline = {
  pvPower: 4120,
  sigenPvPower: 4000,
  thirdPartyPvPower: 120,
  loadPower: 980,
  generalLoadPower: 800,
  gridPower: -3140,
  batteryPower: 0,
  batterySoc: 80,
  batterySoh: 99,
  ratedEnergyCapacity: 16,
  consumedToday: 7.3,
  lifetimePv: 9421.5,
  outdoorTemp: 14.2,
  weatherCode: 3,
  outdoorLocation: 'Hobart',
  lastUpdated: '2026-06-19T04:21:07.004Z',
  pollIntervalMs: 5000,
  connected: true,
  alerts: [],
  devices: [
    { type: 'inverter', unitId: 1, model: 'SigenStor EC 15.0 TP AU', status: 'running',
      activePower: 6508, solarPower: 1180, soc: 91.5, soh: 100,
      strings: [{ index: 1, voltage: 300, current: 2, power: 600 }] }
  ]
}

beforeEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
  loadSettings()
  Object.assign(state, baseline)
})

describe('buildSnapshot', () => {
  it('stamps a versioned, self-describing envelope', () => {
    const snapshot = buildSnapshot()
    expect(snapshot.schema).toBe(1)
    expect(snapshot.connected).toBe(true)
    expect(snapshot.lastUpdated).toBe('2026-06-19T04:21:07.004Z')
    expect(snapshot.units).toEqual({ power: 'W', energy: 'kWh', temperature: 'celsius', currency: 'USD' })
    expect(Date.parse(snapshot.generatedAt)).toBeGreaterThan(0)
  })

  it('passes live readings through with derived flow directions', () => {
    const { power } = buildSnapshot()
    expect(power.solar).toBe(4120)
    expect(power.grid).toBe(-3140)
    expect(power.gridDirection).toBe('export')
    expect(power.batteryDirection).toBe('idle')
  })

  it('breaks solar into Sigen and third-party sources and exposes general load', () => {
    const { power } = buildSnapshot()
    expect(power.solarSigen).toBe(4000)
    expect(power.solarThirdParty).toBe(120)
    expect(power.solar).toBe(power.solarSigen + power.solarThirdParty)
    expect(power.home).toBe(980)
    expect(power.homeGeneral).toBe(800)
  })

  it('derives battery energy remaining from the configured capacity', () => {
    updateSettings({ battery: { capacityKwh: 10, reserveSoc: 10 } })
    const { battery } = buildSnapshot()
    expect(battery.capacityKwh).toBe(10)
    expect(battery.energyRemainingKwh).toBeCloseTo(8)
    expect(battery.estimate.status).toBe('idle')
  })

  it('falls back to the rated capacity register when none is configured', () => {
    expect(buildSnapshot().battery.capacityKwh).toBe(16)
  })

  it('omits the tariff section until a rate is configured', () => {
    expect(buildSnapshot().tariff).toBeUndefined()
    updateSettings({ tariff: { importRate: 0.3 } })
    const { tariff } = buildSnapshot()
    expect(tariff.currency).toBe('USD')
    expect(typeof tariff.today.net).toBe('number')
    expect(typeof tariff.netPerHour).toBe('number')
  })

  it('omits the weather section when weather is disabled', () => {
    expect(buildSnapshot().weather.location).toBe('Hobart')
    updateSettings({ weather: { enabled: false } })
    expect(buildSnapshot().weather).toBeUndefined()
  })

  it('passes discovered per-device readings through', () => {
    const { devices } = buildSnapshot()
    expect(devices).toHaveLength(1)
    expect(devices[0]).toMatchObject({ type: 'inverter', unitId: 1, solarPower: 1180 })
    expect(devices[0].strings[0].power).toBe(600)
  })

  it('exposes history stats and links for follow-on queries', () => {
    const { history } = buildSnapshot()
    expect(typeof history.count).toBe('number')
    expect(history.links.recent).toBe('/api/history')
    expect(history.links.export).toContain('/api/history/export')
  })
})
