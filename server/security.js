import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getSettings, updateSecurity } from './settings.js'
import { recordGoogleAccepted, recordGoogleRejected } from './google-status.js'

export const requirePasscode = (request, response, next) => {
  if (!passcodeSet()) return next()
  if (validToken(bearerToken(request))) return next()
  return response.status(401).json({ error: 'Settings are locked' })
}

export const unlock = (request, response) => {
  const client = clientKey(request)
  const lockedFor = lockoutRemaining(client)
  if (lockedFor > 0) return tooManyAttempts(response, lockedFor)
  if (!passcodeSet()) return response.json({ token: openSession() })
  if (!storedPasscodeMatches(request.body?.passcode)) {
    const remaining = registerFailure(client)
    if (remaining === 0) {
      return tooManyAttempts(response, lockoutRemaining(client))
    }
    return response.status(401).json({ error: 'Incorrect passcode', remaining })
  }
  lockouts.delete(client)
  return response.json({ token: openSession() })
}

export const lock = (request, response) => {
  closeSession(bearerToken(request))
  return response.json({ ok: true })
}

export const sessionStatus = (request, response) =>
  response.json({ passcodeSet: passcodeSet(), authenticated: isAuthenticated(request) })

export const isAuthenticated = (request) => !passcodeSet() || validToken(bearerToken(request))

export const requireGoogleToken = (request, response, next) => {
  const expected = getSettings().google.authToken
  if (expected && tokensMatch(bearerToken(request), expected)) {
    recordGoogleAccepted('fulfillment')
    return next()
  }
  recordGoogleRejected({ route: 'fulfillment', reason: 'wrong token' })
  return response.status(401).json({ error: 'Unauthorized' })
}

export const setPasscode = (request, response) => {
  const passcode = String(request.body?.passcode ?? '')
  if (!isNumericPin(passcode)) {
    return response.status(400).json({ error: `passcode must be ${PIN_LENGTH} digits` })
  }
  updateSecurity({ passcode: hashPasscode(passcode) })
  clearSessions()
  resetLockouts()
  return response.json({ token: openSession() })
}

export const clearPasscode = (request, response) => {
  updateSecurity({ passcode: null })
  clearSessions()
  resetLockouts()
  return response.json({ ok: true })
}

export const hashPasscode = (passcode, salt = randomBytes(SALT_BYTES).toString('hex')) => ({
  salt,
  hash: scryptSync(passcode, salt, KEY_BYTES).toString('hex')
})

export const tokensMatch = (provided, expected) => {
  const left = Buffer.from(String(provided))
  const right = Buffer.from(String(expected))
  return left.length === right.length && timingSafeEqual(left, right)
}

export const passcodeMatches = ({ passcode, salt, hash }) => {
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(passcode, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const passcodeSet = () => Boolean(getSettings().security.passcode)

const storedPasscodeMatches = (passcode) => {
  const stored = getSettings().security.passcode
  if (!stored || typeof passcode !== 'string') return false
  return passcodeMatches({ passcode, ...stored })
}

const isNumericPin = (value) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value)

const bearerToken = (request) => {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ')
  return scheme === 'Bearer' && token ? token : ''
}

const tooManyAttempts = (response, retryAfter) =>
  response.status(429).json({ error: 'Too many attempts', retryAfter })

const clientKey = (request) => fromLocalTunnel(request)
  ? `${TUNNEL_KEY_PREFIX}${addressKey(String(request.headers['cf-connecting-ip']))}`
  : addressKey(request.socket?.remoteAddress ?? '')

const fromLocalTunnel = (request) =>
  isLoopback(request.socket?.remoteAddress) && Boolean(request.headers['cf-connecting-ip'])

const isLoopback = (address = '') =>
  address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')

const addressKey = (address) => {
  const mappedIpv4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mappedIpv4) return mappedIpv4[1]
  if (!address.includes(':')) return address
  return `${ipv6Groups(address).slice(0, 4).join(':')}::/64`
}

const ipv6Groups = (address) => {
  const [head, tail] = address.split('%')[0].toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const gap = tail === undefined ? 0 : Math.max(0, 8 - left.length - right.length)
  return [...left, ...Array(gap).fill('0'), ...right].map((group) => group.replace(/^0+(?=.)/, ''))
}

const openSession = () => {
  pruneExpired(sessions, (expiry) => expiry)
  evictOldest(sessions, MAX_SESSIONS)
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  sessions.set(token, Date.now() + SESSION_TTL_MS)
  return token
}

const validToken = (token) => {
  const expiry = sessions.get(token)
  if (!expiry) return false
  if (expiry <= Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

const closeSession = (token) => sessions.delete(token)

const clearSessions = () => sessions.clear()

const lockoutRemaining = (client) => {
  const lockedUntil = Math.max(lockouts.get(client)?.lockedUntil ?? 0, tunnelLockedUntil(client))
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
}

const tunnelLockedUntil = (client) => {
  if (!isTunnelKey(client)) return 0
  const windowStart = Date.now() - FAILURE_WINDOW_MS
  while (failureLog.length > 0 && failureLog[0] <= windowStart) failureLog.shift()
  return failureLog.length < MAX_FAILURES_PER_WINDOW ? 0 : failureLog[0] + FAILURE_WINDOW_MS
}

const isTunnelKey = (client) => client.startsWith(TUNNEL_KEY_PREFIX)

const logFailure = (client, now) => {
  if (!isTunnelKey(client)) return
  failureLog.push(now)
  if (failureLog.length > MAX_FAILURES_PER_WINDOW) failureLog.shift()
}

const resetLockouts = () => {
  lockouts.clear()
  failureLog.splice(0)
}

const registerFailure = (client) => {
  const now = Date.now()
  logFailure(client, now)
  const entry = lockouts.get(client) ?? { failures: 0, strikes: 0, lockedUntil: 0 }
  lockouts.delete(client)
  pruneExpired(lockouts, ({ forgetAt }) => forgetAt)
  evictOldest(lockouts, MAX_CLIENTS)
  const failures = entry.failures + 1
  const lockedOut = failures >= MAX_ATTEMPTS
  const strikes = lockedOut ? entry.strikes + 1 : entry.strikes
  const lockedUntil = lockedOut ? now + lockoutDuration(strikes) : entry.lockedUntil
  const forgetAt = Math.max(now, lockedUntil) + MAX_LOCKOUT_MS
  lockouts.set(client, { failures: lockedOut ? 0 : failures, strikes, lockedUntil, forgetAt })
  return lockedOut || tunnelLockedUntil(client) > now ? 0 : MAX_ATTEMPTS - failures
}

const lockoutDuration = (strikes) => Math.min(LOCKOUT_MS * 2 ** (strikes - 1), MAX_LOCKOUT_MS)

const pruneExpired = (map, expiryOf) => {
  const now = Date.now()
  for (const [key, value] of map) if (expiryOf(value) <= now) map.delete(key)
}

const evictOldest = (map, cap) => {
  for (const key of map.keys()) {
    if (map.size < cap) return
    map.delete(key)
  }
}

const PIN_LENGTH = 4

const SALT_BYTES = 16

const KEY_BYTES = 64

const TOKEN_BYTES = 32

const SESSION_TTL_MS = 12 * 60 * 60 * 1000

const MAX_ATTEMPTS = 5

const LOCKOUT_MS = 60 * 1000

const MAX_LOCKOUT_MS = 60 * 60 * 1000

const MAX_CLIENTS = 1000

const MAX_SESSIONS = 100

const MAX_FAILURES_PER_WINDOW = 50

const FAILURE_WINDOW_MS = 60 * 60 * 1000

const TUNNEL_KEY_PREFIX = 'cf:'

const sessions = new Map()

const lockouts = new Map()

const failureLog = []
