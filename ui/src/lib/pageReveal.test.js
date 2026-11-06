import { describe, expect, it } from 'vitest'
import { PAGE_REVEAL, isRevealArrival, revealDelaysOf, revealPlanOf } from './pageReveal.js'

describe('page reveal arrivals', () => {
  it('reveals a fresh forward arrival once, inside its window', () => {
    const arrival = { fresh: true, at: 1000 }
    expect(isRevealArrival({ arrival, nowMs: 1200 })).toBe(true)
    expect(isRevealArrival({ arrival: { ...arrival, revealed: true }, nowMs: 1200 })).toBe(false)
    expect(isRevealArrival({ arrival, nowMs: 1000 + PAGE_REVEAL.arrivalWindowMs + 1 })).toBe(false)
  })

  it('never reveals Back, Forward, or a missing arrival', () => {
    expect(isRevealArrival({ arrival: { fresh: false, at: 1000 }, nowMs: 1000 })).toBe(false)
    expect(isRevealArrival({ arrival: null, nowMs: 1000 })).toBe(false)
  })
})

describe('page reveal delays', () => {
  it('steps on-screen boxes from the top and stops stepping at the cap', () => {
    const boxes = [0, 60, 120, 180, 240, 300, 360].map((top) => ({ top, height: 50 }))
    const step = PAGE_REVEAL.stepMs
    const last = PAGE_REVEAL.maxSteps * step
    expect(revealDelaysOf({ boxes, viewportHeight: 800 })).toEqual([0, step, step * 2, step * 3, last, last, last])
  })

  it('skips boxes below the fold, above the top, or with no height', () => {
    const boxes = [{ top: 0, height: 0 }, { top: 10, height: 40 }, { top: 900, height: 40 }, { top: -80, height: 40 }]
    expect(revealDelaysOf({ boxes, viewportHeight: 844 })).toEqual([null, 0, null, null])
  })

  it('finishes the whole reveal inside 600 ms', () => {
    expect(PAGE_REVEAL.maxSteps * PAGE_REVEAL.stepMs + PAGE_REVEAL.durationMs).toBeLessThan(600)
  })
})

describe('page reveal plans', () => {
  it('fades a repeat visit briefly from half opacity with no stagger', () => {
    const repeat = revealPlanOf({ repeat: true })
    expect(repeat.stepMs).toBe(0)
    expect(repeat.fromOpacity).toBeGreaterThan(0)
    expect(repeat.durationMs).toBeLessThan(PAGE_REVEAL.durationMs)
  })

  it('keeps the full staggered reveal on a first visit', () => {
    const first = revealPlanOf({ repeat: false })
    expect(first.stepMs).toBe(PAGE_REVEAL.stepMs)
    expect(first.fromOpacity).toBe(0)
  })
})
