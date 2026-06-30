import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-security', import.meta.url))

process.env.DATA_DIR = dataDir

const { loadSettings, getSettings, updateSettings, updateSecurity, publicSettings } =
  await import('../settings.js')
const {
  hashPasscode, passcodeMatches, requirePasscode, requireGoogleToken,
  unlock, lock, sessionStatus, setPasscode, clearPasscode
} = await import('../security.js')

const reply = () => {
  const response = { statusCode: 200, body: undefined }
  response.status = (code) => { response.statusCode = code; return response }
  response.json = (body) => { response.body = body; return response }
  return response
}

const call = (handler, { body = {}, token } = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const response = reply()
  handler({ body, headers }, response)
  return response
}

const gate = (token) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const response = reply()
  let passed = false
  requirePasscode({ headers }, response, () => { passed = true })
  return { passed, response }
}

const googleGate = (token) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const response = reply()
  let passed = false
  requireGoogleToken({ headers }, response, () => { passed = true })
  return { passed, response }
}

beforeAll(() => rmSync(dataDir, { recursive: true, force: true }))
beforeEach(() => updateSecurity({ passcode: null }))

describe('passcode hashing', () => {
  it('round-trips a passcode through a salted scrypt hash', () => {
    const stored = hashPasscode('4242')
    expect(stored.salt).toMatch(/^[0-9a-f]+$/)
    expect(stored.hash).toMatch(/^[0-9a-f]+$/)
    expect(passcodeMatches({ passcode: '4242', ...stored })).toBe(true)
    expect(passcodeMatches({ passcode: '4243', ...stored })).toBe(false)
  })

  it('gives a different salt and hash each time', () => {
    const a = hashPasscode('1234')
    const b = hashPasscode('1234')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('security settings masking', () => {
  it('seeds an unset passcode and never returns the hash', () => {
    loadSettings()
    expect(getSettings().security.passcode).toBeNull()
    expect(publicSettings().security).toEqual({ passcodeSet: false })
  })

  it('stores the hash but exposes only that one is set', () => {
    updateSecurity({ passcode: hashPasscode('9999') })
    expect(getSettings().security.passcode.hash).toMatch(/^[0-9a-f]+$/)
    const masked = publicSettings()
    expect(masked.security).toEqual({ passcodeSet: true })
    expect(JSON.stringify(masked)).not.toContain(getSettings().security.passcode.hash)
  })

  it('rejects a malformed stored passcode', () => {
    expect(() => updateSecurity({ passcode: { hash: 'nothex', salt: 'zz' } })).toThrow(/malformed/)
  })
})

describe('the gate', () => {
  it('passes through when no passcode is set', () => {
    expect(gate().passed).toBe(true)
  })

  it('blocks mutations with 401 once a passcode is set and no token is given', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    const { passed, response } = gate()
    expect(passed).toBe(false)
    expect(response.statusCode).toBe(401)
  })

  it('passes through with a token from unlocking', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    const { token } = call(unlock, { body: { passcode: '2468' } }).body
    expect(gate(token).passed).toBe(true)
  })

  it('rejects a forged token', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    expect(gate('deadbeef').passed).toBe(false)
  })
})

describe('session status', () => {
  it('reports authenticated with no passcode set', () => {
    const { body } = call(sessionStatus)
    expect(body).toEqual({ passcodeSet: false, authenticated: true })
  })

  it('reports locked once a passcode is set and no token is given', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    expect(call(sessionStatus).body).toEqual({ passcodeSet: true, authenticated: false })
  })

  it('reports authenticated for a valid token', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    const { token } = call(unlock, { body: { passcode: '2468' } }).body
    expect(call(sessionStatus, { token }).body).toEqual({ passcodeSet: true, authenticated: true })
  })

  it('reports locked for a forged token', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    expect(call(sessionStatus, { token: 'deadbeef' }).body.authenticated).toBe(false)
  })

  it('reports locked once a valid token is revoked by lock', () => {
    setPasscode({ body: { passcode: '2468' }, headers: {} }, reply())
    const { token } = call(unlock, { body: { passcode: '2468' } }).body
    call(lock, { token })
    expect(call(sessionStatus, { token }).body.authenticated).toBe(false)
  })
})

describe('unlock', () => {
  it('issues a token for the correct passcode', () => {
    setPasscode({ body: { passcode: '1357' }, headers: {} }, reply())
    const response = call(unlock, { body: { passcode: '1357' } })
    expect(response.statusCode).toBe(200)
    expect(response.body.token).toMatch(/^[0-9a-f]+$/)
  })

  it('rejects the wrong passcode and counts down remaining attempts', () => {
    setPasscode({ body: { passcode: '1357' }, headers: {} }, reply())
    const response = call(unlock, { body: { passcode: '0000' } })
    expect(response.statusCode).toBe(401)
    expect(response.body.remaining).toBe(4)
  })

  it('locks out on the fifth failure and reports a retry delay', () => {
    setPasscode({ body: { passcode: '1357' }, headers: {} }, reply())
    let last
    for (let attempt = 0; attempt < 4; attempt += 1) last = call(unlock, { body: { passcode: '0000' } })
    expect(last.body.remaining).toBe(1)
    const fifth = call(unlock, { body: { passcode: '0000' } })
    expect(fifth.statusCode).toBe(429)
    expect(fifth.body.retryAfter).toBeGreaterThan(0)
    const locked = call(unlock, { body: { passcode: '1357' } })
    expect(locked.statusCode).toBe(429)
    expect(locked.body.retryAfter).toBeGreaterThan(0)
  })
})

describe('a token revoked by lock no longer opens the gate', () => {
  it('invalidates the token', () => {
    setPasscode({ body: { passcode: '8642' }, headers: {} }, reply())
    const { token } = call(unlock, { body: { passcode: '8642' } }).body
    expect(gate(token).passed).toBe(true)
    call(lock, { token })
    expect(gate(token).passed).toBe(false)
  })
})

describe('set and clear', () => {
  it('rejects a passcode that is not exactly four digits', () => {
    expect(call(setPasscode, { body: { passcode: '12' } }).statusCode).toBe(400)
    expect(call(setPasscode, { body: { passcode: '12345' } }).statusCode).toBe(400)
    expect(call(setPasscode, { body: { passcode: 'abcd' } }).statusCode).toBe(400)
    expect(call(setPasscode, { body: { passcode: '1234' } }).statusCode).toBe(200)
  })

  it('auto-issues a session token when a passcode is set', () => {
    const response = call(setPasscode, { body: { passcode: '4242' } })
    expect(response.body.token).toMatch(/^[0-9a-f]+$/)
    expect(gate(response.body.token).passed).toBe(true)
  })

  it('reopens the gate once the passcode is cleared', () => {
    setPasscode({ body: { passcode: '4242' }, headers: {} }, reply())
    call(clearPasscode)
    expect(getSettings().security.passcode).toBeNull()
    expect(gate().passed).toBe(true)
  })

  it('invalidates earlier sessions when the passcode changes', () => {
    const first = call(setPasscode, { body: { passcode: '1111' } }).body.token
    expect(gate(first).passed).toBe(true)
    const second = call(setPasscode, { body: { passcode: '2222' } }).body.token
    expect(gate(first).passed).toBe(false)
    expect(gate(second).passed).toBe(true)
  })
})

describe('google fulfillment auth', () => {
  beforeEach(() => updateSettings({ google: { authToken: 'fulfil-secret' } }))

  it('passes through with the configured google token', () => {
    expect(googleGate('fulfil-secret').passed).toBe(true)
  })

  it('rejects a missing token with 401', () => {
    const { passed, response } = googleGate()
    expect(passed).toBe(false)
    expect(response.statusCode).toBe(401)
  })

  it('rejects a wrong token', () => {
    expect(googleGate('not-the-token').passed).toBe(false)
  })
})
