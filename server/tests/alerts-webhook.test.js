import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testAlert } from '../alerts.js'
import { getTrigger, serializeTriggers } from '../triggers.js'
import { state } from '../state.js'

let base = ''
let received = null
let server = null

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/fail') {
      response.writeHead(500).end()
      return
    }
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received = JSON.parse(Buffer.concat(chunks).toString())
      response.writeHead(204).end()
    })
  })
  await new Promise((resolve) => server.listen(0, resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

describe('webhook delivery', () => {
  it('posts a payload shaped like a real raised event, sampled at the threshold', async () => {
    state.connected = true
    state.batterySoc = 12
    const result = await testAlert({
      url: `${base}/hook`,
      id: 'alert-1',
      name: 'Battery low',
      trigger: { type: 'batteryBelow', threshold: 15 }
    })
    expect(result.ok).toBe(true)
    expect(received.event).toBe('raised')
    expect(received.id).toBe('alert-1')
    expect(received.name).toBe('Battery low')
    expect(received.trigger).toBe('batteryBelow')
    expect(received.message).toMatch(/Battery charge is at 15%/)
    expect(received.condition).toEqual({ value: 15, comparison: 'atOrBelow', threshold: 15, unit: '%' })
    expect(received.batterySoc).toBe(12)
    expect(received.connected).toBe(true)
    expect(typeof received.at).toBe('string')
  })

  it('samples gatewayOffline at its configured threshold, not the live data age', async () => {
    state.connected = true
    const result = await testAlert({
      url: `${base}/hook`,
      id: 'gw',
      name: 'Gateway offline',
      trigger: { type: 'gatewayOffline', afterMinutes: 3 }
    })
    expect(result.ok).toBe(true)
    expect(received.condition).toEqual({ value: 3, comparison: 'atOrAbove', threshold: 3, unit: 'min' })
  })

  it('surfaces a non-2xx response as an error', async () => {
    const result = await testAlert({ url: `${base}/fail` })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/500/)
  })

  it('rejects a missing url', async () => {
    expect(await testAlert({ url: '' })).toEqual({ ok: false, error: 'webhook URL is required' })
  })
})

describe('every trigger reports a coherent condition at its threshold', () => {
  const capabilities = { batterySohPresent: true, weatherEnabled: true, tariffConfigured: true }
  const liveContext = {
    connected: true, dataAgeMs: 60000, batterySoc: 50, batterySoh: 90,
    pvPower: 1000, gridPower: -500, loadPower: 800, outdoorTemp: 20, costPerHour: 0.5,
    estimate: { status: 'ready', direction: 'discharge', minutesRemaining: 120 }
  }

  for (const spec of serializeTriggers(capabilities)) {
    it(`${spec.type} samples at its threshold with an inclusive comparison`, () => {
      const param = spec.params[0]
      const params = Object.fromEntries(spec.params.map((entry) => [entry.key, entry.default]))
      const trigger = getTrigger(spec.type)
      const { message, condition } = trigger.sample(params)
      const reading = trigger.reading({ ctx: liveContext, params })

      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
      expect(condition.comparison).toMatch(/^atOr(Above|Below)$/)
      expect(reading.comparison).toBe(condition.comparison)
      expect(condition.unit).toBe(param.unit)
      expect(reading.unit).toBe(param.unit)
      expect(condition.threshold).toBe(param.default)
      expect(condition.value).toBe(condition.threshold)
    })
  }
})
