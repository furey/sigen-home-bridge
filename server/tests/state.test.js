import { describe, expect, it } from 'vitest'
import { publish, state, subscribe } from '../state.js'

describe('state pub/sub', () => {
  it('notifies subscribers with the shared state', () => {
    let received = null
    const unsubscribe = subscribe((value) => { received = value })
    publish()
    expect(received).toBe(state)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    let calls = 0
    const unsubscribe = subscribe(() => { calls += 1 })
    publish()
    unsubscribe()
    publish()
    expect(calls).toBe(1)
  })
})
