import { isIP } from 'node:net'
import { config } from './config.js'

export const requireAllowedHost = (request, response, next) => {
  if (hostAllowed(hostnameOf(request.headers.host))) return next()
  return response.status(403).json({
    error: `Host "${request.headers.host ?? ''}" is not allowed; add its hostname to ALLOWED_HOSTS`
  })
}

export const requireSameSiteJson = (request, response, next) => {
  if (!STATE_CHANGING_METHODS.has(request.method)) return next()
  if (mediaType(request.headers['content-type']) !== 'application/json') {
    return response.status(403).json({ error: 'Content-Type must be application/json' })
  }
  if (originMatches(request)) return next()
  return response.status(403).json({ error: 'Cross-origin request refused' })
}

const hostAllowed = (hostname) => {
  if (!hostname) return false
  if (isIP(hostname) || hostname === 'localhost' || !hostname.includes('.')) return true
  if (LAN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true
  return config.http.allowedHosts.some((entry) => hostnameOf(entry) === hostname)
}

const originMatches = (request) => {
  const { origin } = request.headers
  if (origin === undefined) return true
  const originUrl = parseUrl(origin)
  return Boolean(originUrl) && originUrl.host === parseUrl(`http://${request.headers.host}`)?.host
}

const hostnameOf = (host) => {
  if (!host) return ''
  return parseUrl(`http://${host}`)?.hostname.replace(/^\[|\]$/g, '') ?? ''
}

const parseUrl = (value) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

const mediaType = (contentType = '') => contentType.split(';')[0].trim().toLowerCase()

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const LAN_SUFFIXES = ['.local', '.lan', '.home.arpa', '.internal']
