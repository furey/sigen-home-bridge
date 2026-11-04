import { rmSync } from 'node:fs'
import { ServerResponse, request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-event-stream', import.meta.url))

process.env.DATA_DIR = dataDir

rmSync(dataDir, { recursive: true, force: true })

const { loadSettings } = await import('../settings.js')
const { state, publish } = await import('../state.js')
const { createApp } = await import('../server.js')

const servers = []

const listen = async (options) => {
  const server = createApp(options).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  servers.push(server)
  return server.address().port
}

const send = ({ port, path }) => new Promise((resolve, reject) => {
  const outgoing = httpRequest({
    host: '127.0.0.1', port, path, headers: { host: `localhost:${port}` }
  }, (incoming) => {
    const chunks = []
    incoming.on('data', (chunk) => chunks.push(chunk))
    incoming.on('end', () => {
      const text = Buffer.concat(chunks).toString()
      resolve({ status: incoming.statusCode, text, json: parseJson(text) })
    })
  })
  outgoing.on('error', reject)
  outgoing.end()
})

const openStream = (port) => new Promise((resolve, reject) => {
  const outgoing = httpRequest({
    host: '127.0.0.1', port, path: '/events', headers: { host: `localhost:${port}` }
  }, (incoming) => resolve({ incoming, outgoing }))
  outgoing.on('error', reject)
  outgoing.end()
})

const waitForSlot = async (port, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const attempt = await openStream(port)
    if (attempt.incoming.statusCode === 200) return attempt
    attempt.incoming.resume()
    await settle(100)
  }
  return openStream(port)
}

const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

const streamFrames = (text) => text.split('\n\n')
  .filter((frame) => frame.startsWith('data: '))
  .map((frame) => JSON.parse(frame.slice(6)))

const floodPushes = (count) => {
  for (let index = 0; index < count; index += 1) {
    state.alerts = [{ id: `push-${index}`, padding: 'x'.repeat(256 * 1024) }]
    publish()
  }
}

const originalAlerts = state.alerts

beforeAll(() => loadSettings())

afterEach(() => {
  vi.restoreAllMocks()
  state.alerts = originalAlerts
})

afterAll(() => Promise.all(servers.map((server) => new Promise((resolve) => {
  server.closeAllConnections()
  server.close(resolve)
}))))

describe('live event stream', () => {
  it('refuses connections beyond the client cap with 503', async () => {
    const port = await listen()
    const streams = []
    for (let index = 0; index < 50; index += 1) streams.push(await openStream(port))
    expect(streams.every(({ incoming }) => incoming.statusCode === 200)).toBe(true)
    const refused = await send({ port, path: '/events' })
    expect(refused.status).toBe(503)
    expect(refused.json.error).toBeTypeOf('string')
    streams.pop().outgoing.destroy()
    await settle()
    const reopened = await openStream(port)
    expect(reopened.incoming.statusCode).toBe(200)
    for (const { outgoing } of [...streams, reopened]) outgoing.destroy()
    await settle()
  })

  it('stops pushing to a slow client until it drains, then sends the latest state', async () => {
    const port = await listen()
    const writes = vi.spyOn(ServerResponse.prototype, 'write')
    const { incoming, outgoing } = await openStream(port)
    incoming.pause()
    const streamWrites = () => writes.mock.contexts
      .filter((context) => context.getHeader?.('content-type') === 'text/event-stream').length
    try {
      floodPushes(40)
      expect(streamWrites()).toBeLessThan(20)
      const chunks = []
      incoming.on('data', (chunk) => chunks.push(chunk))
      incoming.resume()
      await settle(300)
      const frames = streamFrames(Buffer.concat(chunks).toString())
      expect(frames.at(-1).alerts[0].id).toBe('push-39')
    } finally {
      outgoing.destroy()
      await settle()
    }
  })

  it('drops a client that never drains and frees its slot', async () => {
    const port = await listen({ maxEventClients: 1, stallMs: 200 })
    const stalled = await openStream(port)
    stalled.incoming.pause()
    floodPushes(40)
    expect((await send({ port, path: '/events' })).status).toBe(503)
    const flood = setInterval(() => floodPushes(1), 20)
    try {
      const next = await waitForSlot(port, 5000)
      expect(next.incoming.statusCode).toBe(200)
      next.outgoing.destroy()
    } finally {
      clearInterval(flood)
      stalled.outgoing.destroy()
      await settle()
    }
  })
})
