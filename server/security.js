import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getSettings, updateSecurity } from './settings.js'

export const requirePasscode = (request, response, next) => {
  if (!passcodeSet()) return next()
  if (validToken(bearerToken(request))) return next()
  return response.status(401).json({ error: 'Settings are locked' })
}

export const unlock = (request, response) => {
  const lockedFor = lockoutRemaining()
  if (lockedFor > 0) return response.status(429).json({ error: 'Too many attempts', retryAfter: lockedFor })
  if (!passcodeSet()) return response.json({ token: openSession() })
  if (!storedPasscodeMatches(request.body?.passcode)) {
    const remaining = registerFailure()
    if (remaining === 0) {
      return response.status(429).json({ error: 'Too many attempts', retryAfter: lockoutRemaining() })
    }
    return response.status(401).json({ error: 'Incorrect passcode', remaining })
  }
  resetLockout()
  return response.json({ token: openSession() })
}

export const lock = (request, response) => {
  closeSession(bearerToken(request))
  return response.json({ ok: true })
}

export const sessionStatus = (request, response) =>
  response.json({
    passcodeSet: passcodeSet(),
    authenticated: !passcodeSet() || validToken(bearerToken(request))
  })

export const setPasscode = (request, response) => {
  const passcode = String(request.body?.passcode ?? '')
  if (!isNumericPin(passcode)) {
    return response.status(400).json({ error: `passcode must be ${PIN_LENGTH} digits` })
  }
  updateSecurity({ passcode: hashPasscode(passcode) })
  clearSessions()
  resetLockout()
  return response.json({ token: openSession() })
}

export const clearPasscode = (request, response) => {
  updateSecurity({ passcode: null })
  clearSessions()
  resetLockout()
  return response.json({ ok: true })
}

export const hashPasscode = (passcode, salt = randomBytes(SALT_BYTES).toString('hex')) => ({
  salt,
  hash: scryptSync(passcode, salt, KEY_BYTES).toString('hex')
})

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

const openSession = () => {
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

const lockoutRemaining = () => Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))

const registerFailure = () => {
  failures += 1
  if (failures >= MAX_ATTEMPTS) {
    lockedUntil = Date.now() + LOCKOUT_MS
    failures = 0
    return 0
  }
  return MAX_ATTEMPTS - failures
}

const resetLockout = () => {
  failures = 0
  lockedUntil = 0
}

const PIN_LENGTH = 4

const SALT_BYTES = 16

const KEY_BYTES = 64

const TOKEN_BYTES = 32

const SESSION_TTL_MS = 12 * 60 * 60 * 1000

const MAX_ATTEMPTS = 5

const LOCKOUT_MS = 60 * 1000

const sessions = new Map()

let failures = 0

let lockedUntil = 0
