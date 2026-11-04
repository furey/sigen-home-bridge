import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

const call = (handler, { body = {}, token, socket, headers: extra = {} } = {}) => {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }
  const response = reply()
  handler({ body, headers, socket }, response)
  return response
}

const failUntilLocked = (options = {}) => {
  let response
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = call(unlock, { body: { passcode: '0000' }, ...options })
  }
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

describe('google fulfillment auth with no token configured', () => {
  it('denies every request', () => {
    const saved = getSettings().google.authToken
    getSettings().google.authToken = ''
    const { passed, response } = googleGate()
    getSettings().google.authToken = saved
    expect(passed).toBe(false)
    expect(response.statusCode).toBe(401)
  })
})

describe('per-client lockout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setPasscode({ body: { passcode: '1357' }, headers: {} }, reply())
  })

  afterEach(() => vi.useRealTimers())

  it('ignores cf-connecting-ip from a non-loopback socket', () => {
    const socket = { remoteAddress: '192.0.2.44' }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const headers = { 'cf-connecting-ip': `203.0.113.${attempt}` }
      call(unlock, { body: { passcode: '0000' }, socket, headers })
    }
    const headers = { 'cf-connecting-ip': '203.0.113.99' }
    const response = call(unlock, { body: { passcode: '1357' }, socket, headers })
    expect(response.statusCode).toBe(429)
  })

  it('doubles the lockout on each repeat and caps it at an hour', () => {
    const socket = { remoteAddress: '192.0.2.45' }
    const delays = []
    for (let round = 0; round < 8; round += 1) {
      const response = failUntilLocked({ socket })
      delays.push(response.body.retryAfter)
      vi.advanceTimersByTime(response.body.retryAfter * 1000 + 1)
    }
    expect(delays).toEqual([60, 120, 240, 480, 960, 1920, 3600, 3600])
  }, 60000)

  it('never applies the hourly ceiling to LAN clients', () => {
    for (let client = 0; client < 10; client += 1) {
      failUntilLocked({ socket: { remoteAddress: `198.51.100.${client}` } })
    }
    const owner = { remoteAddress: '192.0.2.200' }
    expect(call(unlock, { body: { passcode: '1357' }, socket: owner }).statusCode).toBe(200)
  }, 60000)

  it('locks new tunnel clients once tunnel failures reach the hourly ceiling', () => {
    const loopback = { remoteAddress: '127.0.0.1' }
    for (let client = 0; client < 10; client += 1) {
      failUntilLocked({ socket: loopback, headers: { 'cf-connecting-ip': `203.0.113.${client}` } })
    }
    const tunnelOwner = { socket: loopback, headers: { 'cf-connecting-ip': '198.51.100.77' } }
    const locked = call(unlock, { body: { passcode: '1357' }, ...tunnelOwner })
    expect(locked.statusCode).toBe(429)
    const lanOwner = { remoteAddress: '192.0.2.201' }
    expect(call(unlock, { body: { passcode: '1357' }, socket: lanOwner }).statusCode).toBe(200)
    vi.advanceTimersByTime(locked.body.retryAfter * 1000 + 1)
    expect(call(unlock, { body: { passcode: '1357' }, ...tunnelOwner }).statusCode).toBe(200)
  }, 60000)

  it('shares one lockout across an IPv6 /64', () => {
    failUntilLocked({ socket: { remoteAddress: '2001:db8:1:2::5' } })
    const sibling = { remoteAddress: '2001:db8:1:2:ffff::9' }
    expect(call(unlock, { body: { passcode: '1357' }, socket: sibling }).statusCode).toBe(429)
    const neighbour = { remoteAddress: '2001:db8:1:3::5' }
    expect(call(unlock, { body: { passcode: '1357' }, socket: neighbour }).statusCode).toBe(200)
  })

  it('resets the doubling after a successful unlock', () => {
    const socket = { remoteAddress: '192.0.2.46' }
    vi.advanceTimersByTime(failUntilLocked({ socket }).body.retryAfter * 1000 + 1)
    expect(call(unlock, { body: { passcode: '1357' }, socket }).statusCode).toBe(200)
    expect(failUntilLocked({ socket }).body.retryAfter).toBe(60)
  })
})

describe('session pruning', () => {
  it('evicts the oldest session once the cap is reached', () => {
    const first = call(unlock).body.token
    const tokens = Array.from({ length: 100 }, () => call(unlock).body.token)
    updateSecurity({ passcode: hashPasscode('4242') })
    expect(gate(first).passed).toBe(false)
    expect(gate(tokens[0]).passed).toBe(true)
    expect(gate(tokens.at(-1)).passed).toBe(true)
  })
})
