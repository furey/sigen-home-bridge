import { rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-http', import.meta.url))

process.env.DATA_DIR = dataDir
process.env.ALLOWED_HOSTS = 'bridge.example.com, other.example.net'

rmSync(dataDir, { recursive: true, force: true })

const { loadSettings, updateSettings, updateSecurity } = await import('../settings.js')
const { hashPasscode } = await import('../security.js')
const { createApp } = await import('../server.js')

const GOOGLE_SECRET = 'google-shared-secret'

const GOOGLE_REDIRECT = 'https://oauth-redirect.googleusercontent.com/r/sigen-project'

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

const postJson = (path, payload = {}, headers = {}) => send({
  method: 'POST', path, body: JSON.stringify(payload),
  headers: { 'content-type': 'application/json', ...headers }
})

const postForm = (path, fields, headers = {}) => send({
  method: 'POST', path, body: new URLSearchParams(fields).toString(),
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }
})

const authorise = (query) => send({ path: `/auth?${new URLSearchParams(query)}` })

const issuedCode = async () => {
  const response = await authorise({ redirect_uri: GOOGLE_REDIRECT, state: 'xyz' })
  return new URL(response.headers.location).searchParams.get('code')
}

const basicAuth = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`

beforeAll(async () => {
  loadSettings()
  updateSettings({ google: { authToken: GOOGLE_SECRET } })
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  port = server.address().port
})

afterAll(() => new Promise((resolve) => {
  server.closeAllConnections()
  server.close(resolve)
}))

describe('google oauth authorise', () => {
  it('rejects a redirect_uri outside Google', async () => {
    const response = await authorise({ redirect_uri: 'https://evil.example/callback', state: 's' })
    expect(response.status).toBe(400)
  })

  it('rejects a lookalike Google host', async () => {
    const response = await authorise({
      redirect_uri: 'https://oauth-redirect.googleusercontent.com.evil.example/r/x', state: 's'
    })
    expect(response.status).toBe(400)
  })

  it('redirects to Google with a random code and the encoded state', async () => {
    const response = await authorise({ redirect_uri: GOOGLE_REDIRECT, state: 'a&b=c d' })
    expect(response.status).toBe(302)
    const location = new URL(response.headers.location)
    expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_REDIRECT)
    expect(location.searchParams.get('state')).toBe('a&b=c d')
    expect(location.searchParams.get('code')).toMatch(/^[0-9a-f]{32,}$/)
  })

  it('accepts the sandbox redirect host', async () => {
    const response = await authorise({
      redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/r/sigen-project',
      state: 's'
    })
    expect(response.status).toBe(302)
  })
})

describe('google oauth token', () => {
  it('rejects a request with no client secret', async () => {
    const response = await postForm('/token', { grant_type: 'authorization_code', code: 'sigen' })
    expect(response.status).toBe(401)
    expect(response.json).toEqual({ error: 'invalid_client' })
  })

  it('rejects a wrong client secret', async () => {
    const code = await issuedCode()
    const response = await postForm('/token', {
      grant_type: 'authorization_code', code, client_id: 'google', client_secret: 'wrong'
    })
    expect(response.status).toBe(401)
    expect(response.json).toEqual({ error: 'invalid_client' })
  })

  it('exchanges a fresh code once for the bearer', async () => {
    const code = await issuedCode()
    const fields = {
      grant_type: 'authorization_code', code, client_id: 'google', client_secret: GOOGLE_SECRET
    }
    const first = await postForm('/token', fields)
    expect(first.status).toBe(200)
    expect(first.json).toMatchObject({
      token_type: 'Bearer', access_token: GOOGLE_SECRET, refresh_token: GOOGLE_SECRET
    })
    const replay = await postForm('/token', fields)
    expect(replay.status).toBe(400)
    expect(replay.json).toEqual({ error: 'invalid_grant' })
  })

  it('rejects an unknown code', async () => {
    const response = await postForm('/token', {
      grant_type: 'authorization_code', code: 'sigen', client_secret: GOOGLE_SECRET
    })
    expect(response.status).toBe(400)
    expect(response.json).toEqual({ error: 'invalid_grant' })
  })

  it('takes the client secret from HTTP Basic auth for a refresh', async () => {
    const fields = { grant_type: 'refresh_token', refresh_token: GOOGLE_SECRET }
    const response = await postForm('/token', fields, {
      authorization: basicAuth('google', GOOGLE_SECRET)
    })
    expect(response.status).toBe(200)
    expect(response.json.access_token).toBe(GOOGLE_SECRET)
  })

  it('rejects a wrong refresh token', async () => {
    const response = await postForm('/token', {
      grant_type: 'refresh_token', refresh_token: 'stale', client_secret: GOOGLE_SECRET
    })
    expect(response.status).toBe(400)
    expect(response.json).toEqual({ error: 'invalid_grant' })
  })

  it('rejects an unsupported grant type', async () => {
    const fields = { grant_type: 'password', client_secret: GOOGLE_SECRET }
    const response = await postForm('/token', fields)
    expect(response.status).toBe(400)
    expect(response.json).toEqual({ error: 'unsupported_grant_type' })
  })
})

describe('per-client unlock lockout', () => {
  beforeEach(() => updateSecurity({ passcode: hashPasscode('1357') }))

  it('locks out only the client that failed', async () => {
    const attacker = { 'cf-connecting-ip': '203.0.113.7' }
    const owner = { 'cf-connecting-ip': '198.51.100.20' }
    let last
    for (let attempt = 0; attempt < 5; attempt += 1) {
      last = await postJson('/api/unlock', { passcode: '0000' }, attacker)
    }
    expect(last.status).toBe(429)
    expect((await postJson('/api/unlock', { passcode: '1357' }, attacker)).status).toBe(429)
    const response = await postJson('/api/unlock', { passcode: '1357' }, owner)
    expect(response.status).toBe(200)
    expect(response.json.token).toMatch(/^[0-9a-f]+$/)
  })
})

describe('host allow-list', () => {
  it('rejects an unknown public hostname', async () => {
    const headers = { host: 'rebind.attacker.example' }
    const response = await send({ path: '/api/state', headers })
    expect(response.status).toBe(403)
    expect(response.json.error).toContain('ALLOWED_HOSTS')
  })

  it('rejects an unknown hostname on the event stream', async () => {
    const response = await send({ path: '/events', headers: { host: 'rebind.attacker.example' } })
    expect(response.status).toBe(403)
  })

  it('accepts LAN-style hosts', async () => {
    const hosts = [
      `localhost:${port}`, '192.168.1.20:5163', '[::1]:5163', 'nas.local', 'homeserver',
      'bridge.lan', 'bridge.home.arpa', 'bridge.internal', '10.0.0.5'
    ]
    for (const host of hosts) {
      const response = await send({ path: '/api/state', headers: { host } })
      expect([host, response.status]).toEqual([host, 200])
    }
  })

  it('accepts hosts listed in ALLOWED_HOSTS', async () => {
    for (const host of ['bridge.example.com', 'other.example.net:8443', 'BRIDGE.example.com']) {
      expect((await send({ path: '/api/state', headers: { host } })).status).toBe(200)
    }
  })

  it('rejects an unlisted host even with a cf-connecting-ip header', async () => {
    const response = await send({
      path: '/api/state', headers: { host: 'sigen.example.org', 'cf-connecting-ip': '203.0.113.9' }
    })
    expect(response.status).toBe(403)
  })

  it('leaves the Google paths open to any host', async () => {
    const path = `/auth?redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT)}`
    const response = await send({ path, headers: { host: 'anything.example' } })
    expect(response.status).toBe(302)
  })
})

describe('cross-site request guard', () => {
  beforeEach(() => updateSecurity({ passcode: null }))

  it('rejects a form-encoded settings reset', async () => {
    const response = await postForm('/api/settings/reset', { confirm: '1' })
    expect(response.status).toBe(403)
  })

  it('rejects a bodiless POST with no content type', async () => {
    const response = await send({ method: 'POST', path: '/api/lock' })
    expect(response.status).toBe(403)
  })

  it('rejects a JSON request from a foreign origin', async () => {
    const response = await postJson('/api/settings/reset', {}, { origin: 'https://evil.example' })
    expect(response.status).toBe(403)
  })

  it('accepts a JSON request from the same origin', async () => {
    const response = await postJson('/api/lock', {}, { origin: `http://localhost:${port}` })
    expect(response.status).toBe(200)
  })

  it('accepts a bodiless JSON DELETE', async () => {
    const response = await send({
      method: 'DELETE',
      path: '/api/security/passcode',
      headers: { 'content-type': 'application/json' }
    })
    expect(response.status).toBe(200)
  })

  it('rejects a localhost origin that differs from the host', async () => {
    const response = await postJson('/api/lock', {}, { origin: 'http://localhost:5173' })
    expect(response.status).toBe(403)
  })

  it('rejects an opaque origin', async () => {
    const response = await postJson('/api/lock', {}, { origin: 'null' })
    expect(response.status).toBe(403)
  })
})
