import { afterEach, describe, expect, it, vi } from 'vitest'

const { useSettings } = await import('../../ui/src/composables/useSettings.js')

const failedResponse = () => ({
  ok: false,
  status: 500,
  json: async () => ({ error: 'Bridge unavailable' })
})

afterEach(() => vi.unstubAllGlobals())

describe('committing a session', () => {
  it('records a failed reload instead of rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => failedResponse()))
    const { commitSession, status, error } = useSettings()
    await expect(commitSession('token')).resolves.toBeDefined()
    expect(status.value).toBe('error')
    expect(error.value).toBe('Bridge unavailable')
  })
})

describe('reloading settings', () => {
  it('exposes reload so a section can refresh server status', async () => {
    const okResponse = {
      ok: true, status: 200, json: async () => ({ googleStatus: { lastAccepted: null } })
    }
    vi.stubGlobal('fetch', vi.fn(async () => okResponse))
    vi.stubGlobal('document', { title: '', documentElement: { style: { setProperty: () => {} } } })
    const { reload } = useSettings()
    expect(typeof reload).toBe('function')
    const data = await reload()
    expect(data.googleStatus).toEqual({ lastAccepted: null })
  })
})
