import { randomBytes } from 'node:crypto'
import { getSettings } from './settings.js'
import { tokensMatch } from './security.js'

export const authorise = (request, response) => {
  const { redirect_uri: redirectUri, state } = request.query
  if (!isGoogleRedirect(redirectUri)) {
    return response.status(400).json({
      error: 'invalid_request',
      error_description: 'redirect_uri must be a Google account-linking address'
    })
  }
  const redirect = new URL(redirectUri)
  redirect.searchParams.set('code', issueCode())
  if (typeof state === 'string') redirect.searchParams.set('state', state)
  return response.redirect(redirect.href)
}

export const exchangeToken = (request, response) => {
  const authToken = getSettings().google.authToken
  const body = request.body ?? {}
  if (!authToken || !tokensMatch(clientSecret(request), authToken)) {
    return response.status(401).json({ error: 'invalid_client' })
  }
  if (body.grant_type === 'authorization_code') {
    return redeemCode(body.code) ? grant(response, authToken) : invalidGrant(response)
  }
  if (body.grant_type === 'refresh_token') {
    return tokensMatch(body.refresh_token ?? '', authToken)
      ? grant(response, authToken)
      : invalidGrant(response)
  }
  return response.status(400).json({ error: 'unsupported_grant_type' })
}

export const warnIfPublicGoogleToken = () => {
  if (getSettings().google.authToken !== PUBLIC_DEFAULT_TOKEN) return
  console.warn(
    '[google] the auth token is the public default, so anyone can pass /token; '
    + 'set it to a long random value in Settings → Google Home')
}

const isGoogleRedirect = (value) =>
  typeof value === 'string' && GOOGLE_REDIRECT_PREFIXES.some((prefix) => value.startsWith(prefix))

const issueCode = () => {
  const now = Date.now()
  for (const [code, expiry] of codes) if (expiry <= now) codes.delete(code)
  for (const code of codes.keys()) {
    if (codes.size < MAX_CODES) break
    codes.delete(code)
  }
  const code = randomBytes(CODE_BYTES).toString('hex')
  codes.set(code, now + CODE_TTL_MS)
  return code
}

const redeemCode = (code) => {
  const expiry = codes.get(code)
  codes.delete(code)
  return expiry > Date.now()
}

const clientSecret = (request) => {
  if (typeof request.body?.client_secret === 'string') return request.body.client_secret
  const [scheme, encoded] = (request.headers.authorization ?? '').split(' ')
  if (scheme !== 'Basic' || !encoded) return ''
  const credentials = Buffer.from(encoded, 'base64').toString()
  const separator = credentials.indexOf(':')
  return separator === -1 ? '' : credentials.slice(separator + 1)
}

const grant = (response, authToken) => response.json({
  token_type: 'Bearer',
  access_token: authToken,
  refresh_token: authToken,
  expires_in: SECONDS_PER_YEAR
})

const invalidGrant = (response) => response.status(400).json({ error: 'invalid_grant' })

const GOOGLE_REDIRECT_PREFIXES = [
  'https://oauth-redirect.googleusercontent.com/r/',
  'https://oauth-redirect-sandbox.googleusercontent.com/r/'
]

const CODE_BYTES = 32

const CODE_TTL_MS = 10 * 60 * 1000

const MAX_CODES = 100

const SECONDS_PER_YEAR = 31536000

const PUBLIC_DEFAULT_TOKEN = 'sigen-home-bridge-token'

const codes = new Map()
