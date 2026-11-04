import express from 'express'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { state, subscribe } from './state.js'
import { buildSnapshot } from './snapshot.js'
import {
  getHistory, getHistoryAll, historyStats, nearestSample, downsampleHistory, historyExportChunks
} from './history.js'
import { getSettings, publicSettings, resetSettings, updateSettings } from './settings.js'
import { testGateway } from './modbus.js'
import { discoverGateways } from './discover.js'
import { testWeather } from './weather.js'
import { testAlert } from './alerts.js'
import { getPairing } from './homekit.js'
import { handleIntent } from './google.js'
import {
  requirePasscode, requireGoogleToken, isAuthenticated,
  unlock, lock, sessionStatus, setPasscode, clearPasscode
} from './security.js'
import { authorise, exchangeToken, warnIfPublicGoogleToken } from './oauth.js'
import { requireAllowedHost, requireSameSiteJson } from './hosts.js'

const uiDist = fileURLToPath(new URL('../ui/dist', import.meta.url))

export const startHttpServer = () => {
  const { port } = getSettings().server
  warnIfPublicGoogleToken()
  return createApp().listen(port, () => console.log(`[http] listening on ${port}`))
}

export const createApp = ({ maxEventClients = MAX_EVENT_CLIENTS, stallMs = MAX_STALL_MS } = {}) => {
  const app = express()
  app.disable('x-powered-by')
  app.use(setSecurityHeaders)
  app.use(['/api', '/events'], requireAllowedHost)
  app.use('/api', requireSameSiteJson)
  app.use(express.json())
  app.get('/events', eventStream({ maxEventClients, stallMs }))
  app.get('/api/state', (request, response) => response.json(state))
  app.get('/api/snapshot', (request, response) => sendJson(request, response, buildSnapshot()))
  app.get('/api/history', (request, response) => sendJson(request, response, getHistory(historyQuery(request.query))))
  app.get('/api/history/stats', (request, response) => response.json(historyStats()))
  app.get('/api/history/nearest', (request, response) =>
    response.json(nearestSample(nearestQuery(request.query))))
  app.get('/api/history/export', (request, response) => exportHistory(request, response, stallMs))
  app.get('/api/settings', (request, response) =>
    response.json(publicSettings({ authenticated: isAuthenticated(request) })))
  app.put('/api/settings', requirePasscode, saveSettings)
  app.post('/api/settings/reset', requirePasscode, (request, response) =>
    response.json(resetSettings() && publicSettings({ authenticated: true })))
  app.get('/api/session', sessionStatus)
  app.post('/api/unlock', unlock)
  app.post('/api/lock', lock)
  app.post('/api/security/passcode', requirePasscode, setPasscode)
  app.delete('/api/security/passcode', requirePasscode, clearPasscode)
  app.post('/api/test/gateway', requirePasscode, testGatewayHandler)
  app.post('/api/discover/gateway', requirePasscode, discoverGatewayHandler)
  app.post('/api/test/weather', requirePasscode, testWeatherHandler)
  app.post('/api/test/alert', requirePasscode, testAlertHandler)
  app.get('/api/homekit/pairing', requirePasscode, (request, response) => response.json(getPairing()))
  app.post('/fulfillment', requireGoogleToken, (request, response) => response.json(handleIntent(request.body)))
  app.get('/auth', authorise)
  app.post('/token', express.urlencoded({ extended: false }), exchangeToken)
  app.use(express.static(uiDist, { setHeaders: setStaticCacheHeaders }))
  app.use(spaFallback)
  app.use(sendJsonNotFound)
  app.use(sendJsonError)
  return app
}

const setSecurityHeaders = (request, response, next) => {
  for (const [name, value] of SECURITY_HEADERS) response.setHeader(name, value)
  next()
}

const sendJson = (request, response, payload) =>
  'pretty' in request.query
    ? response.type('application/json').send(`${JSON.stringify(payload, null, 2)}\n`)
    : response.json(payload)

const historyQuery = ({ order, limit, since, until, every }) => ({
  order: order === 'desc' ? 'desc' : 'asc',
  limit: limit == null ? undefined : Number(limit),
  since: parseTime(since),
  until: parseTime(until),
  every: exportIntervalMs(every) || undefined
})

const nearestQuery = ({ before, after }) => ({
  before: parseTime(before),
  after: parseTime(after)
})

const parseTime = (value) => {
  if (value == null || value === '') return null
  const asNumber = Number(value)
  if (Number.isFinite(asNumber)) return asNumber
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const setStaticCacheHeaders = (response, filePath) => {
  if (filePath.endsWith('index.html')) return response.setHeader('Cache-Control', 'no-store')
  if (filePath.includes('/assets/')) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
}

const eventStream = ({ maxEventClients, stallMs }) => {
  const clients = new Set()
  return (request, response) => {
    if (clients.size >= maxEventClients) {
      return response.status(503).json({ error: 'Too many live connections; close another tab and retry' })
    }
    clients.add(response)
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    const stream = backpressuredStream(response, stallMs)
    stream.send(state)
    const heartbeat = setInterval(stream.ping, HEARTBEAT_MS)
    const unsubscribe = subscribe(stream.send)
    response.on('close', () => {
      clients.delete(response)
      clearInterval(heartbeat)
      stream.stop()
      unsubscribe()
    })
  }
}

const backpressuredStream = (response, stallMs) => {
  let blocked = false
  let stale = false
  let stallTimer = null
  const write = (chunk) => {
    blocked = !response.write(chunk)
    if (blocked) stallTimer ??= setTimeout(() => response.destroy(), stallMs)
  }
  const stop = () => {
    clearTimeout(stallTimer)
    stallTimer = null
  }
  const send = (payload) => {
    if (blocked) {
      stale = true
      return
    }
    write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  const ping = () => {
    if (!blocked) write('event: ping\ndata: {}\n\n')
  }
  response.on('drain', () => {
    stop()
    blocked = false
    if (!stale) return
    stale = false
    send(state)
  })
  return { send, ping, stop }
}

const saveSettings = (request, response, next) => {
  try {
    updateSettings(request.body)
    response.json(publicSettings({ authenticated: true }))
  } catch (error) {
    if (!error.status) return next(error)
    response.status(error.status).json({ error: error.message })
  }
}

const testGatewayHandler = async (request, response) => {
  const fallback = getSettings().sigen
  const { host = fallback.host, port = fallback.port, unitId = fallback.unitId } = request.body ?? {}
  if (!host) return response.status(400).json({ ok: false, error: 'gateway host is required' })
  response.json(await testGateway({ host, port, unitId }))
}

const discoverGatewayHandler = async (request, response) => {
  const fallback = getSettings().sigen
  const { port = fallback.port, unitId = fallback.unitId } = request.body ?? {}
  response.json(await discoverGateways({ port: Number(port), unitId: Number(unitId) }))
}

const exportHistory = async (request, response, stallMs) => {
  const rows = downsampleHistory(getHistoryAll().slice(), exportIntervalMs(request.query.every))
  const stamp = new Date().toISOString().slice(0, 10)
  const format = request.query.format === 'json' ? 'json' : 'csv'
  response.setHeader('Content-Type', EXPORT_CONTENT_TYPES[format])
  response.setHeader('Content-Disposition', `attachment; filename="sigen-history-${stamp}.${format}"`)
  await streamChunks({ response, chunks: historyExportChunks({ rows, format }), stallMs })
}

const streamChunks = async ({ response, chunks, stallMs }) => {
  for (const chunk of chunks) {
    if (response.destroyed) return
    if (!response.write(chunk)) await drainedOrClosed(response, stallMs)
    await new Promise((resolve) => setImmediate(resolve))
  }
  if (!response.destroyed) response.end()
}

const drainedOrClosed = async (response, stallMs) => {
  const abort = new AbortController()
  const stallTimer = setTimeout(() => response.destroy(), stallMs)
  await Promise.race([
    once(response, 'drain', { signal: abort.signal }),
    once(response, 'close', { signal: abort.signal })
  ]).catch(() => {})
  clearTimeout(stallTimer)
  abort.abort()
}

const exportIntervalMs = (every) => {
  const seconds = Number(every)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

const testWeatherHandler = async (request, response) => {
  const fallback = getSettings().weather
  const { latitude = null, longitude = null, units = fallback.units } = request.body ?? {}
  response.json(await testWeather({ latitude, longitude, units }))
}

const testAlertHandler = async (request, response) => {
  const { url = '', id, name, trigger } = request.body ?? {}
  response.json(await testAlert({ url, id, name, trigger }))
}

const spaFallback = (request, response, next) => {
  if (request.method !== 'GET' || isApiPath(request.path)) return next()
  response.setHeader('Cache-Control', 'no-store')
  response.sendFile(resolve(uiDist, 'index.html'))
}

const isApiPath = (path) => path === '/api' || path.startsWith('/api/')

const sendJsonNotFound = (request, response) => response.status(404).json({ error: 'Not found' })

const sendJsonError = (error, request, response, next) => {
  const status = clientErrorStatus(error)
  if (!status) console.error(`[http] ${request.method} ${request.originalUrl} failed: ${error.stack ?? error}`)
  if (response.headersSent) return response.destroy()
  response.status(status ?? 500).json({ error: status ? error.message : 'Internal server error' })
}

const clientErrorStatus = (error) => {
  const status = error?.status ?? error?.statusCode
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : null
}

const SECURITY_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'same-origin'],
  ['X-Frame-Options', 'DENY'],
  ['Content-Security-Policy', "frame-ancestors 'none'"]
]

const EXPORT_CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8'
}

const MAX_EVENT_CLIENTS = 50

const MAX_STALL_MS = 45000

const HEARTBEAT_MS = 15000
