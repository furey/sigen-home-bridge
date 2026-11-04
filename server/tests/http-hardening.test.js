import { chmodSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-http-hardening', import.meta.url))

process.env.DATA_DIR = dataDir

rmSync(dataDir, { recursive: true, force: true })

const { loadSettings, updateSecurity } = await import('../settings.js')
const { createApp } = await import('../server.js')

let server
let port

const send = ({ method = 'GET', path, headers = {}, body }) => new Promise((resolve, reject) => {
  const outgoing = httpRequest({
    host: '127.0.0.1', port, method, path, headers: { host: `localhost:${port}`, ...headers }
  }, (incoming) => {
    const chunks = []
    incoming.on('data', (chunk) => chunks.push(chunk))
    incoming.on('end', () => {
      const text = Buffer.concat(chunks).toString()
      const { statusCode: status, headers } = incoming
      resolve({ status, headers, text, json: parseJson(text) })
    })
  })
  outgoing.on('error', reject)
  if (body !== undefined) outgoing.write(body)
  outgoing.end()
})

const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

beforeAll(async () => {
  loadSettings()
  updateSecurity({ passcode: null })
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  port = server.address().port
})

afterAll(() => new Promise((resolve) => {
  chmodSync(dataDir, 0o755)
  server.closeAllConnections()
  server.close(resolve)
}))

afterEach(() => vi.restoreAllMocks())

describe('security headers', () => {
  it('sends hardening headers and hides the framework on API routes', async () => {
    const response = await send({ path: '/api/state' })
    expect(response.headers['x-powered-by']).toBeUndefined()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['referrer-policy']).toBe('same-origin')
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['content-security-policy']).toBe("frame-ancestors 'none'")
  })

  it('sends them on the Google OAuth paths too', async () => {
    const response = await send({ path: '/auth?redirect_uri=https://evil.example/' })
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
})

describe('error responses', () => {
  it('answers a malformed JSON body with a JSON 400 and no stack', async () => {
    const response = await send({
      method: 'PUT', path: '/api/settings', body: '{"sigen":',
      headers: { 'content-type': 'application/json' }
    })
    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.json.error).toBeTypeOf('string')
    expect(response.text).not.toMatch(/at .*\.js/)
  })

  it('answers a settings write failure with a JSON 500', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    chmodSync(dataDir, 0o500)
    try {
      const response = await send({
        method: 'PUT', path: '/api/settings', body: JSON.stringify({ history: { retentionDays: 9 } }),
        headers: { 'content-type': 'application/json' }
      })
      expect(response.status).toBe(500)
      expect(response.json).toEqual({ error: 'Internal server error' })
      const logged = [...log.mock.calls, ...error.mock.calls].flat().join(' ')
      expect(logged).toContain('[http]')
    } finally {
      chmodSync(dataDir, 0o755)
    }
  })

  it('keeps validation errors at 400 with their message', async () => {
    const response = await send({
      method: 'PUT', path: '/api/settings', body: JSON.stringify({ history: { retentionDays: -1 } }),
      headers: { 'content-type': 'application/json' }
    })
    expect(response.status).toBe(400)
    expect(response.json.error).toContain('history retention')
  })
})

describe('unknown routes', () => {
  it('answers an unknown API path with a JSON 404 instead of the app shell', async () => {
    const response = await send({ path: '/api/no-such-route' })
    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.json).toEqual({ error: 'Not found' })
  })

  it('answers an unknown API POST with a JSON 404', async () => {
    const response = await send({
      method: 'POST', path: '/api/no-such-route', body: '{}',
      headers: { 'content-type': 'application/json' }
    })
    expect(response.status).toBe(404)
    expect(response.json).toEqual({ error: 'Not found' })
  })
})
