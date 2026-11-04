import { afterEach, describe, expect, it, vi } from 'vitest'

const { ref } = await import('../../ui/node_modules/vue/index.mjs')
const { useSettings } = await import('../../ui/src/composables/useSettings.js')
const { useSession } = await import('../../ui/src/composables/useSession.js')
const { useGatewayScan } = await import('../../ui/src/composables/useGatewayScan.js')

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
})

const htmlResponse = (status) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    throw new SyntaxError('Unexpected token < in JSON')
  }
})

const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const gatewayRefs = () => ({
  host: ref('192.0.2.10'), port: ref(502), unitId: ref(247), testResult: ref(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useSession().clearToken()
  useSession().expiredMidEdit.value = false
})

describe('test and discover requests', () => {
  it('return an error object for a non-OK JSON reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: 'Internal server error' })))
    const result = await useSettings().discoverGateway({ port: 502, unitId: 247 })
    expect(result).toEqual(expect.objectContaining({ error: 'Internal server error' }))
  })

  it('return an error object for a non-JSON reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(502)))
    const result = await useSettings().discoverGateway({ port: 502, unitId: 247 })
    expect(result.error).toBeTypeOf('string')
  })

  it('return an error object when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const result = await useSettings().discoverGateway({ port: 502, unitId: 247 })
    expect(result.error).toBeTypeOf('string')
  })

  it('treat a 401 as an expired session', async () => {
    useSession().setToken('stale-token')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Settings are locked' })))
    const result = await useSettings().discoverGateway({ port: 502, unitId: 247 })
    expect(result.error).toBe('Settings are locked')
    expect(useSession().token.value).toBeNull()
    expect(useSession().expiredMidEdit.value).toBe(true)
  })
})

describe('gateway scan', () => {
  it('shows a failed discovery as a scan error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Settings are locked' })))
    const scanner = useGatewayScan(gatewayRefs())
    await scanner.scan()
    expect(scanner.scanError.value).toBe('Settings are locked')
    expect(scanner.scanCandidates.value).toBeNull()
    expect(scanner.scanning.value).toBe(false)
  })
})

describe('gateway connection test', () => {
  it('ignores a stale result for a host that has since changed', async () => {
    const pending = deferred()
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    const refs = gatewayRefs()
    const scanner = useGatewayScan(refs)
    const first = scanner.test()
    expect(scanner.testing.value).toBe(true)
    refs.host.value = '192.0.2.99'
    scanner.cancelTest()
    pending.resolve(jsonResponse(200, { ok: true, batterySoc: 64 }))
    await first
    expect(refs.testResult.value).toBeNull()
    expect(scanner.testing.value).toBe(false)
  })

  it('lets only the latest of overlapping tests write the result', async () => {
    const slow = deferred()
    const fast = deferred()
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise))
    const refs = gatewayRefs()
    const scanner = useGatewayScan(refs)
    const older = scanner.test()
    refs.host.value = '192.0.2.99'
    const newer = scanner.test()
    fast.resolve(jsonResponse(200, { ok: false, error: 'No reply' }))
    await newer
    slow.resolve(jsonResponse(200, { ok: true, batterySoc: 64 }))
    await older
    expect(refs.testResult.value).toEqual(expect.objectContaining({ ok: false, error: 'No reply' }))
    expect(scanner.testing.value).toBe(false)
  })

  it('clears the spinner and reports an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(500)))
    const refs = gatewayRefs()
    const scanner = useGatewayScan(refs)
    await scanner.test()
    expect(scanner.testing.value).toBe(false)
    expect(refs.testResult.value.ok).not.toBe(true)
    expect(refs.testResult.value.error).toBeTypeOf('string')
  })
})

describe('gateway scan start', () => {
  it('tells the caller a scan is starting so it can drop a queued auto test', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { candidates: [] })))
    const onScanStart = vi.fn()
    const scanner = useGatewayScan({ ...gatewayRefs(), onScanStart })
    await scanner.scan()
    expect(onScanStart).toHaveBeenCalledOnce()
  })
})

describe('HomeKit pairing request', () => {
  it('returns the pairing details on success', async () => {
    const pairing = { uri: 'X-HM://abc', pin: '516-35-163', qr: 'data:image/svg+xml;base64,AA' }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, pairing)))
    expect(await useSettings().fetchPairing()).toEqual(pairing)
  })

  it('returns an error when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const result = await useSettings().fetchPairing()
    expect(result.error).toBeTypeOf('string')
    expect(result.qr).toBe('')
  })

  it('passes through an unavailable error from the bridge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { error: 'HomeKit is not running' })))
    expect((await useSettings().fetchPairing()).error).toBe('HomeKit is not running')
  })

  it('treats a 401 as an expired session', async () => {
    useSession().setToken('stale-token')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Settings are locked' })))
    const result = await useSettings().fetchPairing()
    expect(result.error).toBe('Settings are locked')
    expect(useSession().token.value).toBeNull()
    expect(useSession().expiredMidEdit.value).toBe(true)
  })
})
