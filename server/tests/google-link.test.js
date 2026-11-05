import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-google-link', import.meta.url))

process.env.DATA_DIR = dataDir
process.env.GOOGLE_AUTH_TOKEN = ''

rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })
writeFileSync(`${dataDir}/settings.json`, JSON.stringify({
  setupComplete: true,
  google: { authToken: 'sigen-home-bridge-token' }
}))

const { loadSettings, getSettings, updateSettings, updateSecurity } = await import('../settings.js')
const { hashPasscode } = await import('../security.js')
const { createApp } = await import('../server.js')

const STRONG_TOKEN = 'a'.repeat(64)

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
      resolve({ status: incoming.statusCode, json: parseJson(text) })
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

const putSettings = (patch) => send({
  method: 'PUT', path: '/api/settings', body: JSON.stringify(patch),
  headers: { 'content-type': 'application/json' }
})

const postForm = (path, fields) => send({
  method: 'POST', path, body: new URLSearchParams(fields).toString(),
  headers: { 'content-type': 'application/x-www-form-urlencoded' }
})

const fulfil = (token) => send({
  method: 'POST', path: '/fulfillment', body: JSON.stringify({ requestId: 'r', inputs: [] }),
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }
})

const googleStatus = async () => (await send({ path: '/api/settings' })).json.googleStatus

const lastAccepted = async () => (await googleStatus()).lastAccepted

const lastRejected = async () => (await googleStatus()).lastRejected

beforeAll(async () => {
  loadSettings()
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  port = server.address().port
})

afterAll(() => new Promise((resolve) => {
  server.closeAllConnections()
  server.close(resolve)
}))

describe('stored weak google token', () => {
  it('loads unchanged at boot', () => {
    expect(getSettings().google.authToken).toBe('sigen-home-bridge-token')
  })

  it('reports no google request before one arrives', async () => {
    expect(await googleStatus()).toEqual({ lastAccepted: null, lastRejected: null })
  })
})

describe('saving a google token', () => {
  it('rejects the public default', async () => {
    const response = await putSettings({ google: { authToken: 'sigen-home-bridge-token' } })
    expect(response.status).toBe(400)
    expect(response.json.error).toMatch(/public default/)
  })

  it('rejects a token shorter than 32 characters', async () => {
    const response = await putSettings({ google: { authToken: 'short-token' } })
    expect(response.status).toBe(400)
    expect(response.json.error).toMatch(/32 characters/)
    expect(getSettings().google.authToken).toBe('sigen-home-bridge-token')
  })

  it('accepts a long token', async () => {
    const response = await putSettings({ google: { authToken: STRONG_TOKEN } })
    expect(response.status).toBe(200)
    expect(getSettings().google.authToken).toBe(STRONG_TOKEN)
  })

  it('leaves other google fields saveable without a token', async () => {
    const response = await putSettings({ google: { powerUnit: 'kilowatts' } })
    expect(response.status).toBe(200)
  })
})

describe('google request status', () => {
  beforeAll(() => updateSettings({ google: { authToken: STRONG_TOKEN } }))

  it('records a wrong fulfillment token as a rejection', async () => {
    await fulfil('not-the-token')
    expect(await lastRejected()).toEqual({
      at: expect.any(String), route: 'fulfillment', reason: 'wrong token'
    })
    expect(await lastAccepted()).toBeNull()
  })

  it('records an accepted fulfillment with an ISO time', async () => {
    await fulfil(STRONG_TOKEN)
    const accepted = await lastAccepted()
    expect(accepted).toEqual({ at: expect.any(String), route: 'fulfillment' })
    expect(new Date(accepted.at).toISOString()).toBe(accepted.at)
  })

  it('keeps the acceptance when a later request is rejected', async () => {
    await fulfil(STRONG_TOKEN)
    await postForm('/token', {
      grant_type: 'refresh_token', client_secret: 'nope', refresh_token: 'x'
    })
    expect(await lastAccepted()).toMatchObject({ route: 'fulfillment' })
    expect(await lastRejected()).toMatchObject({ route: 'token', reason: 'wrong client secret' })
  })

  it('records an invalid grant on /token', async () => {
    await postForm('/token', {
      grant_type: 'refresh_token', client_secret: STRONG_TOKEN, refresh_token: 'x'
    })
    expect(await lastRejected()).toMatchObject({ route: 'token', reason: 'invalid grant' })
  })

  it('records an unsupported grant on /token', async () => {
    await postForm('/token', { grant_type: 'password', client_secret: STRONG_TOKEN })
    expect(await lastRejected()).toMatchObject({ route: 'token', reason: 'unsupported grant' })
  })

  it('records an accepted refresh on /token', async () => {
    await postForm('/token', {
      grant_type: 'refresh_token', client_secret: STRONG_TOKEN, refresh_token: STRONG_TOKEN
    })
    expect(await lastAccepted()).toMatchObject({ route: 'token' })
  })

  it('records a bad redirect on /auth', async () => {
    await send({ path: '/auth?redirect_uri=https://evil.example/callback' })
    expect(await lastRejected()).toMatchObject({ route: 'auth', reason: 'bad redirect' })
  })

  it('never counts an /auth redirect as accepted', async () => {
    const before = await lastAccepted()
    const query = new URLSearchParams({ redirect_uri: GOOGLE_REDIRECT, state: 's' })
    await send({ path: `/auth?${query}` })
    expect(await lastAccepted()).toEqual(before)
  })

  it('never carries the token in the status', async () => {
    await fulfil(STRONG_TOKEN)
    expect(JSON.stringify(await googleStatus())).not.toContain(STRONG_TOKEN)
  })
})

describe('google request status while locked', () => {
  beforeAll(() => updateSecurity({ passcode: hashPasscode('1234') }))

  afterAll(() => updateSecurity({ passcode: null }))

  it('is left out of the redacted settings', async () => {
    const { json } = await send({ path: '/api/settings' })
    expect(json.security.passcodeSet).toBe(true)
    expect(json).not.toHaveProperty('googleStatus')
  })
})
