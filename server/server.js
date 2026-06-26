import express from 'express'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { state, subscribe } from './state.js'
import { buildSnapshot } from './snapshot.js'
import {
  getHistory, getHistoryAll, historyStats, nearestSample, downsampleHistory, historyToCsv
} from './history.js'
import { getSettings, publicSettings, resetSettings, updateSettings } from './settings.js'
import { testGateway } from './modbus.js'
import { discoverGateways } from './discover.js'
import { testWeather } from './weather.js'
import { testAlert } from './alerts.js'
import { getPairing } from './homekit.js'
import { handleIntent } from './google.js'
import { requirePasscode, unlock, lock, sessionStatus, setPasscode, clearPasscode } from './security.js'

const uiDist = fileURLToPath(new URL('../ui/dist', import.meta.url))

export const startHttpServer = () => {
  const app = express()
  app.use(express.json())
  app.get('/events', streamEvents)
  app.get('/api/state', (request, response) => response.json(state))
  app.get('/api/snapshot', (request, response) => sendJson(request, response, buildSnapshot()))
  app.get('/api/history', (request, response) => sendJson(request, response, getHistory(historyQuery(request.query))))
  app.get('/api/history/stats', (request, response) => response.json(historyStats()))
  app.get('/api/history/nearest', (request, response) =>
    response.json(nearestSample(nearestQuery(request.query))))
  app.get('/api/history/export', exportHistory)
  app.get('/api/settings', (request, response) => response.json(publicSettings()))
  app.put('/api/settings', requirePasscode, saveSettings)
  app.post('/api/settings/reset', requirePasscode, (request, response) => response.json(resetSettings() && publicSettings()))
  app.get('/api/session', sessionStatus)
  app.post('/api/unlock', unlock)
  app.post('/api/lock', lock)
  app.post('/api/security/passcode', requirePasscode, setPasscode)
  app.delete('/api/security/passcode', requirePasscode, clearPasscode)
  app.post('/api/test/gateway', testGatewayHandler)
  app.post('/api/discover/gateway', discoverGatewayHandler)
  app.post('/api/test/weather', testWeatherHandler)
  app.post('/api/test/alert', testAlertHandler)
  app.get('/api/homekit/pairing', (request, response) => response.json(getPairing()))
  app.post('/fulfillment', (request, response) => response.json(handleIntent(request.body)))
  app.get('/auth', stubAuth)
  app.post('/token', stubToken)
  app.use(express.static(uiDist, { setHeaders: setStaticCacheHeaders }))
  app.use(spaFallback)
  const { port } = getSettings().server
  return app.listen(port, () => console.log(`[http] listening on ${port}`))
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

const streamEvents = (request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  const send = (payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send(state)
  const heartbeat = setInterval(() => response.write('event: ping\ndata: {}\n\n'), HEARTBEAT_MS)
  const unsubscribe = subscribe(send)
  request.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}

const saveSettings = (request, response) => {
  try {
    updateSettings(request.body)
    response.json(publicSettings())
  } catch (error) {
    response.status(error.status ?? 400).json({ error: error.message })
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

const exportHistory = (request, response) => {
  const rows = downsampleHistory(getHistoryAll(), exportIntervalMs(request.query.every))
  const stamp = new Date().toISOString().slice(0, 10)
  if (request.query.format === 'json') {
    response.setHeader('Content-Disposition', `attachment; filename="sigen-history-${stamp}.json"`)
    return response.json(rows)
  }
  response.setHeader('Content-Type', 'text/csv; charset=utf-8')
  response.setHeader('Content-Disposition', `attachment; filename="sigen-history-${stamp}.csv"`)
  return response.send(historyToCsv(rows))
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

const stubAuth = (request, response) => {
  const { redirect_uri, state: oauthState } = request.query
  response.redirect(`${redirect_uri}?code=sigen&state=${oauthState ?? ''}`)
}

const stubToken = (request, response) => {
  const { authToken } = getSettings().google
  response.json({
    token_type: 'Bearer',
    access_token: authToken,
    refresh_token: authToken,
    expires_in: SECONDS_PER_YEAR
  })
}

const spaFallback = (request, response, next) => {
  if (request.method !== 'GET') return next()
  response.setHeader('Cache-Control', 'no-store')
  response.sendFile(resolve(uiDist, 'index.html'))
}

const HEARTBEAT_MS = 15000

const SECONDS_PER_YEAR = 31536000
