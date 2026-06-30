import { getSettings } from './settings.js'
import { state, publish } from './state.js'
import { getHistoryAll } from './history.js'
import { batteryEstimate, netPerHour, socPercent, tariffConfigured } from './derive.js'
import { getTrigger } from './triggers.js'

export const startAlerts = () => {
  tick()
  setInterval(tick, TICK_MS)
}

export const getActiveAlertIds = () => activeIds

export const testAlert = async ({ url, id, name, trigger }) => {
  if (!url) return { ok: false, error: 'webhook URL is required' }
  try {
    await postWebhook(url, samplePayload({ id, name, trigger }))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export const stepRule = ({ prev, bad, armMs, clearMs, now }) => {
  if (bad === prev.active) return { next: { ...prev, candidateAt: null }, edge: null }
  const candidateAt = prev.candidateAt ?? now
  const elapsed = now - candidateAt
  const settled = elapsed >= (prev.active ? clearMs : armMs)
  if (!settled) return { next: { ...prev, candidateAt }, edge: null }
  return {
    next: { active: bad, since: bad ? now : null, candidateAt: null },
    edge: bad ? 'raised' : 'cleared'
  }
}

const tick = () => {
  const settings = getSettings()
  const now = Date.now()
  const ctx = buildContext(settings, now)
  const edges = []
  const present = new Set()
  for (const item of settings.alerts.items) {
    present.add(item.id)
    const trigger = getTrigger(item.trigger.type)
    if (!trigger) continue
    const edge = evaluate({ item, trigger, enabled: item.enabled, ctx, now })
    if (edge) edges.push({ item, edge, at: now })
  }
  prune(present)
  const active = activeAlerts(settings.alerts.items, ctx)
  activeIds = new Set(active.map((alert) => alert.id))
  state.alerts = active
  publish()
  if (edges.length) dispatch({ edges, ctx })
}

const evaluate = ({ item, trigger, enabled, ctx, now }) => {
  const prev = runtime.get(item.id) ?? IDLE
  if (!enabled) {
    runtime.set(item.id, IDLE)
    return prev.active ? 'cleared' : null
  }
  const bad = trigger.isBad({ ctx, params: item.trigger, active: prev.active })
  const { next, edge } = stepRule({
    prev,
    bad,
    armMs: trigger.armMs(item.trigger),
    clearMs: trigger.clearMs(item.trigger),
    now
  })
  runtime.set(item.id, next)
  return edge
}

const dispatch = ({ edges, ctx }) => {
  for (const { item, edge, at } of edges) {
    const { webhook } = item.channels
    if (!webhook.enabled || !webhook.url || !item.notify[edge]) continue
    postWebhook(webhook.url, payloadFor({ item, edge, at, ctx }))
      .catch((error) => log(`webhook failed: ${error.message}`))
  }
}

const buildContext = (settings, now) => {
  const capacityKwh = settings.battery.capacityKwh ?? state.ratedEnergyCapacity
  const configured = tariffConfigured(settings.tariff)
  return {
    connected: state.connected,
    dataAgeMs: state.lastUpdated ? now - Date.parse(state.lastUpdated) : Infinity,
    batterySoc: state.batterySoc,
    batterySoh: state.batterySoh,
    pvPower: state.pvPower,
    gridPower: state.gridPower,
    batteryPower: state.batteryPower,
    loadPower: state.loadPower,
    outdoorTemp: settings.weather.enabled ? state.outdoorTemp : null,
    costPerHour: configured
      ? -netPerHour({ tariff: settings.tariff, gridWatts: state.gridPower ?? 0, now: new Date(now) })
      : null,
    estimate: batteryEstimate(getHistoryAll(), { capacityKwh, reserveSoc: settings.battery.reserveSoc })
  }
}

const activeAlerts = (items, ctx) =>
  items
    .filter((item) => runtime.get(item.id)?.active)
    .map((item) => ({
      id: item.id,
      name: item.name,
      trigger: item.trigger.type,
      message: describe(item, ctx),
      condition: conditionFor(item, ctx),
      since: new Date(runtime.get(item.id).since).toISOString()
    }))

const payloadFor = ({ item, edge, at, ctx, sample = null }) => ({
  event: edge,
  id: item.id,
  name: item.name,
  trigger: item.trigger.type,
  message: sample ? sample.message : messageFor(item, edge, ctx),
  condition: sample ? sample.condition : conditionFor(item, ctx),
  batterySoc: socPercent(state.batterySoc),
  connected: state.connected,
  at: new Date(at).toISOString()
})

const messageFor = (item, edge, ctx) =>
  edge === 'raised' ? describe(item, ctx) : `${item.name} cleared`

const describe = (item, ctx) => {
  const trigger = getTrigger(item.trigger.type)
  return trigger ? trigger.describe({ ctx, params: item.trigger }) : item.name
}

const conditionFor = (item, ctx) => {
  const trigger = getTrigger(item.trigger.type)
  return trigger?.reading ? trigger.reading({ ctx, params: item.trigger }) : null
}

const prune = (present) => {
  for (const id of runtime.keys()) if (!present.has(id)) runtime.delete(id)
}

const samplePayload = ({ id, name, trigger }) => {
  const now = Date.now()
  const item = { id: id ?? 'test', name: name ?? 'Test alert', trigger: trigger ?? {} }
  const sample = getTrigger(item.trigger.type)?.sample?.(item.trigger) ?? null
  const ctx = sample ? null : buildContext(getSettings(), now)
  return payloadFor({ item, edge: 'raised', at: now, ctx, sample })
}

const postWebhook = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`webhook responded ${response.status}`)
}

const log = (message) => console.log(`[alerts] ${message}`)

const runtime = new Map()

let activeIds = new Set()

const IDLE = { active: false, since: null, candidateAt: null }

const TICK_MS = 15000

const WEBHOOK_TIMEOUT_MS = 5000
