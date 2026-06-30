import { rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data', import.meta.url))

process.env.DATA_DIR = dataDir
process.env.POLL_INTERVAL_MS = '60000'
process.env.RECONNECT_DELAY_MS = '10000'
process.env.POLL_SCHEDULE = '08:00-12:00@5000'

const { loadSettings, updateSettings, updateSecurity, publicSettings, resetSettings } =
  await import('../settings.js')

beforeAll(() => rmSync(dataDir, { recursive: true, force: true }))

describe('settings', () => {
  it('seeds defaults from the environment', () => {
    const { poll } = loadSettings()
    expect(poll.defaultIntervalMs).toBe(60000)
    expect(poll.schedule).toEqual([{ start: '08:00', end: '12:00', intervalMs: 5000 }])
  })

  it('rejects sub-second intervals', () => {
    expect(() => updateSettings({ poll: { defaultIntervalMs: 100 } })).toThrow(/integer/)
  })

  it('rejects malformed windows', () => {
    expect(() => updateSettings({
      poll: { schedule: [{ start: '8am', end: '12:00', intervalMs: 5000 }] }
    })).toThrow(/HH:MM/)
  })

  it('persists updates and overrides the env seed', () => {
    updateSettings({ poll: { defaultIntervalMs: 30000, schedule: [] } })
    expect(loadSettings().poll.defaultIntervalMs).toBe(30000)
  })
})

describe('settings validation', () => {
  it('rejects an out-of-range gateway port', () => {
    expect(() => updateSettings({ sigen: { port: 0 } })).toThrow(/port/)
  })

  it('rejects a malformed homekit pin', () => {
    expect(() => updateSettings({ homekit: { pin: '1234' } })).toThrow(/pin/)
  })

  it('rejects unknown temperature units', () => {
    expect(() => updateSettings({ weather: { units: 'kelvin' } })).toThrow(/units/)
  })

  it('rejects an out-of-range latitude', () => {
    expect(() => updateSettings({ weather: { latitude: 200 } })).toThrow(/latitude/)
  })

  it('accepts cleared coordinates', () => {
    const { weather } = updateSettings({ weather: { latitude: null, longitude: null } })
    expect(weather.latitude).toBeNull()
    expect(weather.longitude).toBeNull()
  })
})

describe('battery', () => {
  it('seeds an unknown capacity and a zero reserve', () => {
    const { battery } = loadSettings()
    expect(battery.capacityKwh).toBeNull()
    expect(battery.reserveSoc).toBe(0)
    expect(battery.chargeUnit).toBe('percent')
  })

  it('persists the charge readout unit', () => {
    const { battery } = updateSettings({ battery: { chargeUnit: 'energy' } })
    expect(battery.chargeUnit).toBe('energy')
  })

  it('rejects an unknown charge readout unit', () => {
    expect(() => updateSettings({ battery: { chargeUnit: 'kwh' } })).toThrow(/charge unit/)
  })

  it('persists capacity and reserve', () => {
    const { battery } = updateSettings({ battery: { capacityKwh: 12.5, reserveSoc: 20 } })
    expect(battery.capacityKwh).toBe(12.5)
    expect(battery.reserveSoc).toBe(20)
  })

  it('clears the capacity back to unknown', () => {
    const { battery } = updateSettings({ battery: { capacityKwh: '' } })
    expect(battery.capacityKwh).toBeNull()
    expect(battery.reserveSoc).toBe(20)
  })

  it('rejects a non-positive capacity', () => {
    expect(() => updateSettings({ battery: { capacityKwh: 0 } })).toThrow(/capacity/)
  })

  it('rejects an out-of-range reserve', () => {
    expect(() => updateSettings({ battery: { reserveSoc: 100 } })).toThrow(/reserve/)
  })
})

describe('tariff', () => {
  it('seeds a hidden tariff with zero rates', () => {
    const { tariff } = loadSettings()
    expect(tariff.showOnDashboard).toBe(false)
    expect(tariff.costMode).toBe('perDay')
    expect(tariff.currency).toBe('USD')
    expect(tariff.importRate).toBe(0)
    expect(tariff.importWindows).toEqual([])
    expect(tariff.zeroDrawCredit.enabled).toBe(false)
    expect(tariff.superExportCredit.capKwh).toBe(15)
  })

  it('persists toggles, mode, rates, windows, and credits', () => {
    const { tariff } = updateSettings({
      tariff: {
        showOnDashboard: true,
        costMode: 'perHour',
        currency: 'aud',
        importRate: 0.462,
        importWindows: [
          { start: '16:00', end: '23:00', rate: 0.572 },
          { start: '11:00', end: '14:00', rate: 0 }
        ],
        exportWindows: [{ start: '16:00', end: '23:00', rate: 0.05 }],
        supplyChargePerDay: 2.65,
        zeroDrawCredit: { enabled: true, start: '18:00', end: '21:00', perDay: 1 },
        superExportCredit: { enabled: true, start: '16:00', end: '23:00', capKwh: 15, rate: 0.1 }
      }
    })
    expect(tariff.showOnDashboard).toBe(true)
    expect(tariff.costMode).toBe('perHour')
    expect(tariff.currency).toBe('AUD')
    expect(tariff.importRate).toBe(0.462)
    expect(tariff.importWindows).toHaveLength(2)
    expect(tariff.importWindows[0]).toEqual({ start: '16:00', end: '23:00', rate: 0.572 })
    expect(tariff.supplyChargePerDay).toBe(2.65)
    expect(tariff.zeroDrawCredit.perDay).toBe(1)
    expect(tariff.superExportCredit.rate).toBe(0.1)
  })

  it('keeps other tariff fields when a patch touches one', () => {
    const { tariff } = updateSettings({ tariff: { importRate: 0.5 } })
    expect(tariff.importRate).toBe(0.5)
    expect(tariff.currency).toBe('AUD')
    expect(tariff.importWindows).toHaveLength(2)
    expect(tariff.zeroDrawCredit.enabled).toBe(true)
  })

  it('rejects a negative rate', () => {
    expect(() => updateSettings({ tariff: { importRate: -1 } })).toThrow(/import rate/)
  })

  it('rejects a malformed currency', () => {
    expect(() => updateSettings({ tariff: { currency: 'AU' } })).toThrow(/currency/)
  })

  it('rejects an unknown cost mode', () => {
    expect(() => updateSettings({ tariff: { costMode: 'perWeek' } })).toThrow(/cost mode/)
  })

  it('rejects a malformed window clock', () => {
    expect(() => updateSettings({
      tariff: { importWindows: [{ start: '4pm', end: '23:00', rate: 0.5 }] }
    })).toThrow(/HH:MM/)
  })
})

describe('history', () => {
  it('seeds the default retention window', () => {
    expect(loadSettings().history.retentionDays).toBe(7)
  })

  it('persists a custom retention window', () => {
    expect(updateSettings({ history: { retentionDays: 30 } }).history.retentionDays).toBe(30)
  })

  it('rejects a zero retention window', () => {
    expect(() => updateSettings({ history: { retentionDays: 0 } })).toThrow(/retention/)
  })

  it('rejects an over-long retention window', () => {
    expect(() => updateSettings({ history: { retentionDays: 365 } })).toThrow(/retention/)
  })

  it('rejects a fractional retention window', () => {
    expect(() => updateSettings({ history: { retentionDays: 7.5 } })).toThrow(/retention/)
  })
})

describe('alerts', () => {
  it('seeds an empty alerts list', () => {
    expect(loadSettings().alerts).toEqual({ items: [] })
  })

  it('publishes the trigger catalogue for the UI', () => {
    const types = publicSettings().alertTriggers.map((trigger) => trigger.type)
    expect(types).toContain('gatewayOffline')
    expect(types).toContain('batteryBelow')
    expect(types).toContain('batteryAbove')
  })

  it('persists self-contained alerts with per-alert channels', () => {
    const { alerts } = updateSettings({
      alerts: {
        items: [
          {
            id: 'a1', name: 'Battery flat', enabled: true,
            trigger: { type: 'batteryBelow', threshold: 20 },
            notify: { raised: true, cleared: false },
            channels: {
              homekit: { enabled: true, sensorName: 'Battery Sensor' },
              webhook: { enabled: true, url: 'https://ntfy.sh/sigen' }
            }
          }
        ]
      }
    })
    expect(alerts.items).toHaveLength(1)
    expect(alerts.items[0].trigger).toEqual({ type: 'batteryBelow', threshold: 20 })
    expect(alerts.items[0].channels.homekit).toEqual({ enabled: true, sensorName: 'Battery Sensor' })
    expect(alerts.items[0].channels.webhook).toEqual({ enabled: true, url: 'https://ntfy.sh/sigen' })
  })

  it('replaces the whole list when a patch includes items', () => {
    expect(updateSettings({ alerts: { items: [] } }).alerts.items).toEqual([])
  })

  it('generates an id when one is missing and fills param defaults', () => {
    const { alerts } = updateSettings({
      alerts: { items: [{ name: 'No id', trigger: { type: 'gatewayOffline', afterMinutes: 4 } }] }
    })
    expect(alerts.items[0].id).toMatch(/[0-9a-f-]{36}/)
    expect(alerts.items[0].trigger.afterMinutes).toBe(4)
  })

  it('defaults a blank name to the trigger label and seeds default params', () => {
    const { alerts } = updateSettings({
      alerts: { items: [{ id: 'x', name: '  ', trigger: { type: 'solarAbove' } }] }
    })
    expect(alerts.items[0].name).toBe('High solar output')
    expect(alerts.items[0].trigger.threshold).toBe(5000)
  })

  it('keeps a blank sensor name empty so it falls back to the alert name', () => {
    const { alerts } = updateSettings({
      alerts: {
        items: [{
          id: 'x', name: 'My alert', trigger: { type: 'solarAbove' },
          channels: { homekit: { enabled: true, sensorName: '  ' } }
        }]
      }
    })
    expect(alerts.items[0].channels.homekit).toEqual({ enabled: true, sensorName: '' })
  })

  it('rejects an unknown trigger type', () => {
    expect(() => updateSettings({ alerts: { items: [{ trigger: { type: 'nope' } }] } }))
      .toThrow(/unknown alert trigger/)
  })

  it('rejects an out-of-range threshold', () => {
    expect(() => updateSettings({
      alerts: { items: [{ trigger: { type: 'batteryBelow', threshold: 100 } }] }
    })).toThrow(/threshold/)
  })

  it('rejects a fractional whole-number param', () => {
    expect(() => updateSettings({
      alerts: { items: [{ trigger: { type: 'gatewayOffline', afterMinutes: 2.5 } }] }
    })).toThrow(/whole number/)
  })

  it('caps the number of alerts', () => {
    const many = Array.from({ length: 25 }, () => ({ trigger: { type: 'gatewayOffline' } }))
    expect(() => updateSettings({ alerts: { items: many } })).toThrow(/at most 24/)
  })

  it('requires a url when an alert webhook is enabled', () => {
    expect(() => updateSettings({
      alerts: { items: [{ name: 'x', trigger: { type: 'gatewayOffline' }, channels: { webhook: { enabled: true, url: '' } } }] }
    })).toThrow(/webhook URL is required/)
  })

  it('rejects a non-http alert webhook url', () => {
    expect(() => updateSettings({
      alerts: { items: [{ name: 'x', trigger: { type: 'gatewayOffline' }, channels: { webhook: { enabled: true, url: 'ftp://nope' } } }] }
    })).toThrow(/http/)
  })
})

describe('secret masking', () => {
  it('stores the google token but never returns it', () => {
    updateSettings({ google: { authToken: 'top-secret-token' } })
    expect(loadSettings().google.authToken).toBe('top-secret-token')
    const sanitized = publicSettings()
    expect(sanitized.google.authToken).toBeUndefined()
    expect(sanitized.googleAuthTokenSet).toBe(true)
  })

  it('keeps the stored token when a patch omits it', () => {
    updateSettings({ google: {} })
    expect(loadSettings().google.authToken).toBe('top-secret-token')
  })
})

describe('security', () => {
  it('seeds an unset passcode masked as not set', () => {
    expect(loadSettings().security.passcode).toBeNull()
    expect(publicSettings().security).toEqual({ passcodeSet: false })
  })

  it('stores a hashed passcode but only reports that one is set', () => {
    updateSecurity({ passcode: { hash: 'abcd1234', salt: 'beef' } })
    expect(loadSettings().security.passcode).toEqual({ hash: 'abcd1234', salt: 'beef' })
    const masked = publicSettings()
    expect(masked.security).toEqual({ passcodeSet: true })
    expect(masked.security.passcode).toBeUndefined()
  })

  it('clears the passcode back to unset', () => {
    expect(updateSecurity({ passcode: null }).passcode).toBeNull()
    expect(publicSettings().security.passcodeSet).toBe(false)
  })

  it('rejects a non-hex stored passcode', () => {
    expect(() => updateSecurity({ passcode: { hash: 'xyz', salt: 'beef' } })).toThrow(/malformed/)
  })

  it('ignores a passcodeSet flag arriving through a settings patch', () => {
    updateSecurity({ passcode: { hash: 'abcd', salt: 'ef01' } })
    updateSettings({ security: { passcodeSet: false } })
    expect(loadSettings().security.passcode).toEqual({ hash: 'abcd', salt: 'ef01' })
  })
})

describe('homekit labels', () => {
  it('seeds default metric labels and accessory info', () => {
    const { homekit } = loadSettings()
    expect(homekit.labels.pvPower).toBe('Solar Production')
    expect(homekit.labels.battery).toBe('Battery Percent')
    expect(homekit.manufacturer).toBe('Sigenergy')
    expect(homekit.model).toBe('Sigen Home Bridge')
  })

  it('publishes the metric descriptor for the UI', () => {
    const keys = publicSettings().homekitMetrics.map((metric) => metric.key)
    expect(keys).toEqual(['battery', 'pvPower', 'gridPower', 'batteryPower', 'loadPower'])
  })

  it('renames one label and leaves the rest at their defaults', () => {
    const { homekit } = updateSettings({ homekit: { labels: { pvPower: 'Roof Panels' } } })
    expect(homekit.labels.pvPower).toBe('Roof Panels')
    expect(homekit.labels.gridPower).toBe('Grid Power')
  })

  it('falls back to the default when a label is blanked', () => {
    const { homekit } = updateSettings({ homekit: { labels: { pvPower: '   ' } } })
    expect(homekit.labels.pvPower).toBe('Solar Production')
  })

  it('rejects an overlong label', () => {
    expect(() => updateSettings({ homekit: { labels: { pvPower: 'x'.repeat(65) } } }))
      .toThrow(/at most 64/)
  })

  it('persists custom accessory info and trims it', () => {
    const { homekit } = updateSettings({ homekit: { manufacturer: '  Acme  ', model: 'Inverter X' } })
    expect(homekit.manufacturer).toBe('Acme')
    expect(homekit.model).toBe('Inverter X')
  })

  it('rejects an overlong manufacturer', () => {
    expect(() => updateSettings({ homekit: { manufacturer: 'x'.repeat(65) } }))
      .toThrow(/manufacturer/)
  })

  it('defaults the power unit to kilowatts and stores a valid choice', () => {
    expect(loadSettings().homekit.powerUnit).toBe('kilowatts')
    expect(updateSettings({ homekit: { powerUnit: 'watts' } }).homekit.powerUnit).toBe('watts')
  })

  it('rejects an unknown power unit', () => {
    expect(() => updateSettings({ homekit: { powerUnit: 'amperes' } })).toThrow(/power unit/)
  })

  it('stores and trims the bind address, and clears it when blank', () => {
    expect(updateSettings({ homekit: { bind: '  192.168.1.50  ' } }).homekit.bind).toBe('192.168.1.50')
    expect(updateSettings({ homekit: { bind: '' } }).homekit.bind).toBeUndefined()
  })
})

describe('google labels', () => {
  it('seeds default device names', () => {
    const { google } = loadSettings()
    expect(google.labels.batterySoc).toBe('Battery Percent')
    expect(google.labels.pvPower).toBe('Solar Production')
  })

  it('publishes the device descriptor and the labels for the UI', () => {
    const sanitized = publicSettings()
    expect(sanitized.googleMetrics.map((metric) => metric.key))
      .toEqual(['batterySoc', 'pvPower', 'gridPower', 'batteryPower', 'loadPower'])
    expect(sanitized.google.labels.pvPower).toBeDefined()
  })

  it('renames one device and leaves the rest at their defaults', () => {
    const { google } = updateSettings({ google: { labels: { pvPower: 'Rooftop Solar' } } })
    expect(google.labels.pvPower).toBe('Rooftop Solar')
    expect(google.labels.loadPower).toBe('Home Consumption')
  })

  it('rejects an overlong device name', () => {
    expect(() => updateSettings({ google: { labels: { pvPower: 'x'.repeat(65) } } }))
      .toThrow(/at most 64/)
  })
})

describe('google display modes', () => {
  it('defaults to the watts power unit and battery tile', () => {
    const { google } = loadSettings()
    expect(google.powerUnit).toBe('watts')
    expect(google.batteryDisplay).toBe('tile')
  })

  it('publishes the modes for the UI', () => {
    const { google } = publicSettings()
    expect(google.powerUnit).toBe('watts')
    expect(google.batteryDisplay).toBe('tile')
  })

  it('stores valid mode choices', () => {
    const { google } = updateSettings({ google: { powerUnit: 'hidden', batteryDisplay: 'reading' } })
    expect(google.powerUnit).toBe('hidden')
    expect(google.batteryDisplay).toBe('reading')
  })

  it('rejects an unknown power unit', () => {
    expect(() => updateSettings({ google: { powerUnit: 'amperes' } })).toThrow(/power unit/)
  })

  it('rejects an unknown battery display', () => {
    expect(() => updateSettings({ google: { batteryDisplay: 'gauge' } })).toThrow(/battery display/)
  })
})

describe('appearance', () => {
  it('seeds the default title and palette', () => {
    const { appearance } = loadSettings()
    expect(appearance.title).toBe('Sigen Home Bridge')
    expect(appearance.metricScale).toBe(0.65)
    expect(appearance.theme.preset).toBe('default')
    expect(appearance.theme.colors.socHigh).toBe('#22c55e')
    expect(appearance.theme.colors.cost).toBe('#fb923c')
    expect(appearance.theme.colors.credit).toBe('#22c55e')
  })

  it('persists a custom title and merged colours', () => {
    const { appearance } = updateSettings({
      appearance: { title: 'Casa del Sol', theme: { preset: 'custom', colors: { home: '#ABCDEF' } } }
    })
    expect(appearance.title).toBe('Casa del Sol')
    expect(appearance.theme.colors.home).toBe('#abcdef')
    expect(appearance.theme.colors.socHigh).toBe('#22c55e')
  })

  it('falls back to the default title when cleared', () => {
    const { appearance } = updateSettings({ appearance: { title: '   ' } })
    expect(appearance.title).toBe('Sigen Home Bridge')
  })

  it('rejects an overlong title', () => {
    expect(() => updateSettings({ appearance: { title: 'x'.repeat(61) } })).toThrow(/60/)
  })

  it('persists the metric scale', () => {
    const { appearance } = updateSettings({ appearance: { metricScale: 1.4 } })
    expect(appearance.metricScale).toBe(1.4)
  })

  it('rejects an out-of-range metric scale', () => {
    expect(() => updateSettings({ appearance: { metricScale: 9 } })).toThrow(/metric scale/)
  })

  it('seeds the auto devices button mode and persists show or hide overrides', () => {
    expect(loadSettings().appearance.devicesButton).toBe('auto')
    expect(updateSettings({ appearance: { devicesButton: 'show' } }).appearance.devicesButton).toBe('show')
    expect(updateSettings({ appearance: { devicesButton: 'hide' } }).appearance.devicesButton).toBe('hide')
  })

  it('rejects an unknown devices button mode', () => {
    expect(() => updateSettings({ appearance: { devicesButton: 'maybe' } })).toThrow(/devices button/)
  })

  it('seeds the kilowatt power unit with two decimals', () => {
    const { appearance } = loadSettings()
    expect(appearance.powerUnit).toBe('kW')
    expect(appearance.powerDecimals).toBe(2)
  })

  it('persists the power unit and decimals without disturbing other appearance fields', () => {
    const { appearance } = updateSettings({ appearance: { powerUnit: 'W', powerDecimals: 0 } })
    expect(appearance.powerUnit).toBe('W')
    expect(appearance.powerDecimals).toBe(0)
    expect(appearance.metricScale).toBe(1.4)
    expect(appearance.theme.colors.home).toBe('#abcdef')
  })

  it('rejects an unknown power unit', () => {
    expect(() => updateSettings({ appearance: { powerUnit: 'amps' } })).toThrow(/power unit/)
  })

  it('rejects out-of-range power decimals', () => {
    expect(() => updateSettings({ appearance: { powerDecimals: 5 } })).toThrow(/power decimals/)
  })

  it('rejects a malformed colour', () => {
    expect(() => updateSettings({
      appearance: { theme: { colors: { idle: 'not-a-colour' } } }
    })).toThrow(/hex colour/)
  })
})

describe('setup lifecycle', () => {
  it('persists the setup-complete flag', () => {
    updateSettings({ setupComplete: true })
    expect(loadSettings().setupComplete).toBe(true)
  })

  it('reset wipes stored values back to env seeds and clears setup', () => {
    const after = resetSettings()
    expect(after.setupComplete).toBe(false)
    expect(after.poll.defaultIntervalMs).toBe(60000)
    expect(after.poll.schedule).toEqual([{ start: '08:00', end: '12:00', intervalMs: 5000 }])
  })
})

describe('alerts migration', () => {
  it('upgrades the legacy rules and channels shape to per-alert channels', () => {
    writeFileSync(`${dataDir}/settings.json`, JSON.stringify({
      setupComplete: true,
      alerts: {
        enabled: true,
        rules: {
          gatewayOffline: { enabled: true, afterMinutes: 5 },
          lowBattery: { enabled: false, soc: 12 }
        },
        channels: {
          homekit: { enabled: true, labels: { gatewayOffline: 'Inverter Down', lowBattery: 'Battery Low' } },
          webhook: { enabled: true, url: 'https://ntfy.sh/legacy' }
        }
      }
    }))
    const { alerts } = loadSettings()
    expect(alerts.items).toHaveLength(2)
    expect(alerts.items.find((item) => item.id === 'gatewayOffline')).toMatchObject({
      name: 'Inverter Down',
      enabled: true,
      trigger: { type: 'gatewayOffline', afterMinutes: 5 },
      notify: { raised: true, cleared: true },
      channels: {
        homekit: { enabled: true },
        webhook: { enabled: true, url: 'https://ntfy.sh/legacy' }
      }
    })
    const low = alerts.items.find((item) => item.id === 'lowBattery')
    expect(low.trigger).toEqual({ type: 'batteryBelow', threshold: 12 })
    expect(low.enabled).toBe(false)
    expect(alerts).not.toHaveProperty('transports')
    expect(alerts).not.toHaveProperty('enabled')
  })

  it('upgrades the shared-transports shape to per-alert channels', () => {
    writeFileSync(`${dataDir}/settings.json`, JSON.stringify({
      setupComplete: true,
      alerts: {
        enabled: true,
        items: [{
          id: 'k', name: 'Keep', enabled: true,
          trigger: { type: 'batteryBelow', threshold: 20 },
          notify: { raised: true, cleared: false },
          channels: { homekit: true, webhook: true }
        }],
        transports: { homekit: { enabled: true }, webhook: { enabled: true, url: 'https://ntfy.sh/mid' } }
      }
    }))
    const { alerts } = loadSettings()
    expect(alerts).not.toHaveProperty('transports')
    expect(alerts.items[0].channels).toEqual({
      homekit: { enabled: true, sensorName: '' },
      webhook: { enabled: true, url: 'https://ntfy.sh/mid' }
    })
  })
})

describe('secret redaction when locked', () => {
  beforeAll(() => updateSettings({
    sigen: { host: '10.0.0.9' },
    homekit: { pin: '111-22-333' },
    alerts: {
      items: [{
        name: 'Hook', trigger: { type: 'gatewayOffline' },
        channels: { webhook: { enabled: true, url: 'https://ntfy.sh/secret' } }
      }]
    }
  }))

  it('exposes secrets when no passcode is set', () => {
    updateSecurity({ passcode: null })
    const open = publicSettings({ authenticated: false })
    expect(open.homekit.pin).toBe('111-22-333')
    expect(open.sigen.host).toBe('10.0.0.9')
    expect(open.alerts.items[0].channels.webhook.url).toBe('https://ntfy.sh/secret')
  })

  it('redacts the pin, gateway host and webhook url for an unauthenticated caller once a passcode is set', () => {
    updateSecurity({ passcode: { hash: 'abcd1234', salt: 'beef' } })
    const locked = publicSettings({ authenticated: false })
    expect(locked.homekit.pin).toBe('')
    expect(locked.sigen.host).toBe('')
    expect(locked.alerts.items[0].channels.webhook.url).toBe('')
  })

  it('exposes secrets to an authenticated caller and leaves the stored values intact', () => {
    const open = publicSettings({ authenticated: true })
    expect(open.homekit.pin).toBe('111-22-333')
    expect(open.sigen.host).toBe('10.0.0.9')
    expect(open.alerts.items[0].channels.webhook.url).toBe('https://ntfy.sh/secret')
    updateSecurity({ passcode: null })
  })
})
