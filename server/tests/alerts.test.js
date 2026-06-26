import { describe, expect, it } from 'vitest'
import { stepRule } from '../alerts.js'
import { getTrigger, serializeTriggers } from '../triggers.js'

const baseCtx = {
  connected: true,
  dataAgeMs: 0,
  batterySoc: 50,
  batterySoh: 95,
  pvPower: 0,
  gridPower: 0,
  batteryPower: 0,
  loadPower: 0,
  outdoorTemp: 20,
  costPerHour: 0,
  estimate: { status: 'idle' }
}

const IDLE = { active: false, since: null, candidateAt: null }

const ARM = 120000
const CLEAR = 30000

const step = (prev, bad, now) => stepRule({ prev, bad, armMs: ARM, clearMs: CLEAR, now })

describe('stepRule', () => {
  it('stays clear while the condition is good', () => {
    const { next, edge } = step(IDLE, false, 1000)
    expect(edge).toBeNull()
    expect(next.active).toBe(false)
    expect(next.candidateAt).toBeNull()
  })

  it('arms on the first bad reading without firing', () => {
    const { next, edge } = step(IDLE, true, 1000)
    expect(edge).toBeNull()
    expect(next.active).toBe(false)
    expect(next.candidateAt).toBe(1000)
  })

  it('holds the alert until the arm window elapses', () => {
    const armed = step(IDLE, true, 1000).next
    expect(step(armed, true, 1000 + ARM - 1).edge).toBeNull()
  })

  it('raises once the bad reading persists past the arm window', () => {
    const armed = step(IDLE, true, 1000).next
    const { next, edge } = step(armed, true, 1000 + ARM)
    expect(edge).toBe('raised')
    expect(next.active).toBe(true)
    expect(next.since).toBe(1000 + ARM)
  })

  it('emits no further edges while it stays active', () => {
    const active = { active: true, since: 0, candidateAt: null }
    const { next, edge } = step(active, true, 5000)
    expect(edge).toBeNull()
    expect(next.active).toBe(true)
    expect(next.candidateAt).toBeNull()
  })

  it('resets the arm candidate when the condition recovers early', () => {
    const armed = step(IDLE, true, 1000).next
    const recovered = step(armed, false, 1500)
    expect(recovered.edge).toBeNull()
    expect(recovered.next.candidateAt).toBeNull()
    expect(recovered.next.active).toBe(false)
  })

  it('clears only after the recovery window elapses', () => {
    const active = { active: true, since: 0, candidateAt: null }
    const recovering = step(active, false, 2000).next
    expect(recovering.candidateAt).toBe(2000)
    expect(step(recovering, false, 2000 + CLEAR - 1).edge).toBeNull()
    expect(step(recovering, false, 2000 + CLEAR).edge).toBe('cleared')
  })

  it('cancels a pending clear when the condition trips again', () => {
    const active = { active: true, since: 0, candidateAt: null }
    const recovering = step(active, false, 2000).next
    const tripped = step(recovering, true, 2500)
    expect(tripped.edge).toBeNull()
    expect(tripped.next.active).toBe(true)
    expect(tripped.next.candidateAt).toBeNull()
  })
})

const isBad = (type, ctx, params, active = false) =>
  getTrigger(type).isBad({ ctx: { ...baseCtx, ...ctx }, params, active })

describe('trigger conditions', () => {
  it('flags low battery only at or below the threshold', () => {
    expect(isBad('batteryBelow', { batterySoc: 20 }, { threshold: 15 })).toBe(false)
    expect(isBad('batteryBelow', { batterySoc: 15 }, { threshold: 15 })).toBe(true)
  })

  it('holds a low-battery alert through its hysteresis band', () => {
    expect(isBad('batteryBelow', { batterySoc: 18 }, { threshold: 15 }, true)).toBe(true)
    expect(isBad('batteryBelow', { batterySoc: 21 }, { threshold: 15 }, true)).toBe(false)
  })

  it('flags high battery at or above the threshold with hysteresis', () => {
    expect(isBad('batteryAbove', { batterySoc: 90 }, { threshold: 90 })).toBe(true)
    expect(isBad('batteryAbove', { batterySoc: 86 }, { threshold: 90 }, true)).toBe(true)
    expect(isBad('batteryAbove', { batterySoc: 84 }, { threshold: 90 }, true)).toBe(false)
  })

  it('ignores battery thresholds while the gateway is disconnected', () => {
    expect(isBad('batteryBelow', { connected: false, batterySoc: 5 }, { threshold: 15 })).toBe(false)
  })

  it('treats the gateway as bad when disconnected or stale', () => {
    expect(isBad('gatewayOffline', { connected: false }, {})).toBe(true)
    expect(isBad('gatewayOffline', { dataAgeMs: 999999 }, {})).toBe(true)
    expect(isBad('gatewayOffline', {}, {})).toBe(false)
    expect(getTrigger('gatewayOffline').armMs({ afterMinutes: 3 })).toBe(180000)
  })

  it('splits grid power into import and export legs', () => {
    expect(isBad('gridImportAbove', { gridPower: 6000 }, { threshold: 5000 })).toBe(true)
    expect(isBad('gridImportAbove', { gridPower: -6000 }, { threshold: 5000 })).toBe(false)
    expect(isBad('gridExportAbove', { gridPower: -6000 }, { threshold: 5000 })).toBe(true)
  })

  it('only fires battery-emptying when discharging with a ready estimate', () => {
    expect(isBad('batteryEmptyWithin', {}, { threshold: 60 })).toBe(false)
    const estimate = { status: 'ready', direction: 'discharge', minutesRemaining: 45 }
    expect(isBad('batteryEmptyWithin', { estimate }, { threshold: 60 })).toBe(true)
  })
})

describe('trigger catalogue', () => {
  it('hides weather, cost, and health triggers until they are available', () => {
    const off = serializeTriggers({ weatherEnabled: false, tariffConfigured: false, batterySohPresent: false })
    const available = (type) => off.find((trigger) => trigger.type === type).available
    expect(available('outdoorTempAbove')).toBe(false)
    expect(available('costRateAbove')).toBe(false)
    expect(available('batteryHealthBelow')).toBe(false)
    expect(available('gatewayOffline')).toBe(true)
    const on = serializeTriggers({ weatherEnabled: true, tariffConfigured: true, batterySohPresent: true })
    expect(on.find((trigger) => trigger.type === 'outdoorTempAbove').available).toBe(true)
  })
})
