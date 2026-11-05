import { mkdtempSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'sigen-history-export-stream-'))

process.env.DATA_DIR = dataDir

const { loadSettings } = await import('../settings.js')
const {
  startHistory, recordSample, downsampleHistory, historyToCsv
} = await import('../history.js')
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
      const { statusCode: status, headers } = incoming
      resolve({ status, headers, text: Buffer.concat(chunks).toString() })
    })
  })
  outgoing.on('error', reject)
  outgoing.end()
})

const pausedDownload = ({ port, path, pauseMs }) => new Promise((resolve, reject) => {
  const outgoing = httpRequest({
    host: '127.0.0.1', port, path, headers: { host: `localhost:${port}` }
  }, (incoming) => {
    let received = 0
    incoming.pause()
    incoming.on('data', (chunk) => {
      received += chunk.length
    })
    incoming.on('end', () => resolve({ received, complete: incoming.complete }))
    incoming.on('error', () => resolve({ received, complete: false }))
    setTimeout(() => incoming.resume(), pauseMs)
  })
  outgoing.on('error', () => resolve({ received: 0, complete: false }))
  outgoing.end()
})

const seedSamples = (count) => {
  const start = Date.parse('2026-06-11T00:00:00.000Z')
  for (let index = 0; index < count; index += 1) {
    recordSample({
      lastUpdated: new Date(start + index * 5000).toISOString(),
      pvPower: index, gridPower: -index, batteryPower: index % 7, batterySoc: 50.5,
      loadPower: 1000, smartPortPower: index % 3 ? null : 12, outdoorTemp: index % 2 ? 18.25 : null
    })
  }
}

const storedRows = () => {
  const db = new DatabaseSync(join(dataDir, 'history.db'))
  const rows = db.prepare(`
    SELECT t, pvPower, gridPower, batteryPower, batterySoc, loadPower, smartPortPower, outdoorTemp
    FROM samples ORDER BY t
  `).all().map((row) => ({ ...row }))
  db.close()
  return rows
}

let stored = []

beforeAll(() => {
  loadSettings()
  startHistory()
  seedSamples(20000)
  stored = storedRows()
})

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => {
    server.closeAllConnections()
    server.close(resolve)
  })))
  rmSync(dataDir, { recursive: true, force: true })
})

describe('history export streaming', () => {
  it('streams CSV byte-identical to the buffered export', async () => {
    const port = await listen()
    const expected = historyToCsv(stored)
    const response = await send({ port, path: '/api/history/export' })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(response.headers['content-disposition']).toMatch(/sigen-history-.*\.csv/)
    expect(response.headers['transfer-encoding']).toBe('chunked')
    expect(response.text).toBe(expected)
    expect(stored).toHaveLength(20000)
  })

  it('streams JSON byte-identical to the buffered export', async () => {
    const port = await listen()
    const expected = JSON.stringify(stored)
    const response = await send({ port, path: '/api/history/export?format=json' })
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(response.headers['transfer-encoding']).toBe('chunked')
    expect(response.text).toBe(expected)
  })

  it('streams a downsampled JSON export identically', async () => {
    const port = await listen()
    const expected = JSON.stringify(downsampleHistory(stored, 60000))
    const response = await send({ port, path: '/api/history/export?format=json&every=60' })
    expect(response.text).toBe(expected)
  })

  it('drops a download that stops reading for longer than the stall limit', async () => {
    const port = await listen({ stallMs: 200 })
    const result = await pausedDownload({ port, path: '/api/history/export?format=json', pauseMs: 800 })
    expect(result.complete).toBe(false)
    expect(result.received).toBeLessThan(JSON.stringify(stored).length)
  })
})
