import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({ mkdirSync: () => {} }))
vi.mock('../config.js', () => ({
  config: { sigen: { host: 'env-host', port: 502 }, paths: { data: '/data' } }
}))
vi.mock('../settings.js', () => ({
  loadSettings: () => {},
  getSettings: () => ({ sigen: { host: 'settings-host', port: 1502 }, server: { port: 4000 } })
}))
vi.mock('../history.js', () => ({ startHistory: () => {} }))
vi.mock('../modbus.js', () => ({ startModbusPoller: () => {} }))
vi.mock('../homekit.js', () => ({ startHomeKit: () => {} }))
vi.mock('../server.js', () => ({ startHttpServer: () => {} }))
vi.mock('../weather.js', () => ({ startWeather: () => {} }))
vi.mock('../alerts.js', () => ({ startAlerts: () => {} }))

describe('startup announcement', () => {
  it('logs the gateway from live settings', async () => {
    const logged = []
    vi.spyOn(console, 'log').mockImplementation((message) => logged.push(message))
    await import('../index.js')
    expect(logged).toContain('[sigen-home-bridge] gateway settings-host:1502')
    vi.restoreAllMocks()
  })
})
