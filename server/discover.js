import { connect } from 'node:net'
import { networkInterfaces } from 'node:os'
import { testGateway } from './modbus.js'

export const discoverGateways = async ({ port, unitId }) => {
  const hosts = subnetPrefixes(networkInterfaces()).flatMap(prefixHosts)
  if (!hosts.length) return { scanned: 0, candidates: [] }
  const open = await sweepPort(hosts, port)
  const verified = await Promise.all(open.map((host) => verifyGateway({ host, port, unitId })))
  return { scanned: hosts.length, candidates: verified.filter(Boolean) }
}

export const subnetPrefixes = (interfaces) => {
  const prefixes = new Set()
  for (const addresses of Object.values(interfaces)) {
    for (const { family, internal, address } of addresses ?? []) {
      if (family !== 'IPv4' || internal) continue
      prefixes.add(address.split('.').slice(0, 3).join('.'))
    }
  }
  return [...prefixes]
}

const prefixHosts = (prefix) => Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`)

const sweepPort = async (hosts, port) => {
  const open = []
  const queue = [...hosts]
  const drain = async () => {
    while (queue.length) {
      const host = queue.shift()
      if (await portOpen(host, port)) open.push(host)
    }
  }
  await Promise.all(Array.from({ length: SWEEP_CONCURRENCY }, drain))
  return open
}

const portOpen = (host, port) =>
  new Promise((resolve) => {
    const socket = connect({ host, port, timeout: PORT_TIMEOUT_MS })
    const settle = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => settle(true))
    socket.once('timeout', () => settle(false))
    socket.once('error', () => settle(false))
  })

const verifyGateway = async ({ host, port, unitId }) => {
  const result = await testGateway({ host, port, unitId })
  return result.ok ? { host, batterySoc: result.batterySoc } : null
}

const SWEEP_CONCURRENCY = 64

const PORT_TIMEOUT_MS = 600
