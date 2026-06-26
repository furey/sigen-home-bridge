import ModbusRTU from 'modbus-serial'
import { getSettings, onSettingsChange } from './settings.js'
import { resolvePollInterval } from './schedule.js'
import { state, publish } from './state.js'
import { recordSample } from './history.js'
import { discoverInverters, readInverter } from './devices.js'

export const startModbusPoller = () => {
  onSettingsChange((changed) => {
    if (changed.includes('sigen')) reconnect()
  })
  connect()
}

export const testGateway = ({ host, port, unitId }) => {
  const probe = new ModbusRTU()
  const attempt = readSoc(probe, { host, port, unitId })
  attempt.catch(() => {})
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ ok: false, error: 'connection timed out' }), TEST_TIMEOUT_MS))
  return Promise.race([attempt, timeout]).finally(() => {
    try {
      probe.close(() => {})
    } catch {}
  })
}

const readSoc = async (probe, { host, port, unitId }) => {
  try {
    await probe.connectTCP(host, { port: Number(port) })
    probe.setID(Number(unitId))
    probe.setTimeout(TEST_TIMEOUT_MS)
    const register = REGISTERS.batterySoc
    const batterySoc = register.decode(await probe.readInputRegisters(register.address, register.length))
    return { ok: true, batterySoc }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export const decodePower = (response) => response.buffer.readInt32BE(0)

export const decodeSoc = (response) => response.data[0] / 10

export const deriveBatteryPower = ({ pvPower, gridPower, loadPower }) =>
  pvPower + gridPower - loadPower

export const solarTotal = ({ sigenPvPower, thirdPartyPvPower }) =>
  (sigenPvPower ?? 0) + (thirdPartyPvPower ?? 0)

const decodeEnergy32 = (response) => response.buffer.readUInt32BE(0) / 100

const decodeEnergy64 = (response) => Number(response.buffer.readBigUInt64BE(0)) / 100

const client = new ModbusRTU()

const connect = async () => {
  const epoch = ++generation
  unsupportedRegisters.clear()
  const { host, port, unitId } = getSettings().sigen
  try {
    await client.connectTCP(host, { port })
    if (epoch !== generation) return
    client.setID(unitId)
    client.setTimeout(SOCKET_TIMEOUT_MS)
    log(`connected to ${host}:${port} unit ${unitId}`)
    inverters = await discover()
    if (epoch !== generation) return
    client.setID(unitId)
    client.setTimeout(SOCKET_TIMEOUT_MS)
    poll(epoch)
  } catch (error) {
    if (epoch === generation) handleFailure(error)
  }
}

const discover = async () => {
  try {
    const found = await discoverInverters(client)
    if (found.length) log(`discovered ${found.length} inverter(s): ${found.map((device) => device.model).join(', ')}`)
    return found
  } catch (error) {
    log(`device discovery failed: ${error.message}`)
    return []
  }
}

const poll = async (epoch) => {
  try {
    client.setID(getSettings().sigen.unitId)
    const readings = {}
    for (const [key, register] of Object.entries(REGISTERS)) {
      if (unsupportedRegisters.has(key)) continue
      try {
        const response = await client.readInputRegisters(register.address, register.length)
        readings[key] = register.decode(response)
      } catch (error) {
        if (!isModbusException(error)) throw error
        log(`${key} (${register.address}) not supported by firmware; skipping`)
        unsupportedRegisters.add(key)
      }
    }
    readings.pvPower = solarTotal(readings)
    readings.batteryPower = deriveBatteryPower(readings)
    readings.devices = await readDevices()
    if (epoch !== generation) return
    Object.assign(state, readings)
    state.lastUpdated = new Date().toISOString()
    state.connected = true
    state.pollIntervalMs = nextPollInterval()
    publish()
    recordSample(state)
    logPoll(scheduleNext(epoch, state.pollIntervalMs))
  } catch (error) {
    if (epoch === generation) handleFailure(error)
  }
}

const readDevices = async () => {
  const results = []
  for (const device of inverters) {
    try {
      results.push(await readInverter(client, device))
    } catch (error) {
      log(`inverter ${device.unitId} read failed: ${error.message}`)
    }
  }
  client.setID(getSettings().sigen.unitId)
  return results
}

const nextPollInterval = () => {
  const { schedule, defaultIntervalMs } = getSettings().poll
  return resolvePollInterval({ schedule, defaultIntervalMs, now: new Date() })
}

const scheduleNext = (epoch, interval) => {
  pollTimer = setTimeout(() => poll(epoch), interval)
  return interval
}

const reconnect = () => {
  generation++
  clearTimeout(pollTimer)
  closeQuietly()
  log('settings changed; reconnecting to gateway')
  setTimeout(connect, RECONNECT_DEBOUNCE_MS)
}

const handleFailure = (error) => {
  state.connected = false
  publish()
  clearTimeout(pollTimer)
  closeQuietly()
  const delay = getSettings().poll.reconnectDelayMs
  log(`error: ${error.message}; reconnecting in ${delay}ms`)
  setTimeout(connect, delay)
}

const closeQuietly = () => {
  try {
    client.close(() => {})
  } catch {}
}

const logPoll = (interval) => {
  log(
    `[poll] SOC: ${state.batterySoc}% | PV: ${kw(state.pvPower)}kW | ` +
    `Grid: ${kw(state.gridPower)}kW | Bat: ${kw(state.batteryPower)}kW | ` +
    `Load: ${kw(state.loadPower)}kW | next ${interval}ms`
  )
}

const isModbusException = (error) => error.message.startsWith('Modbus exception')

const kw = (watts) => (watts / 1000).toFixed(1)

const log = (message) => console.log(`[modbus] ${message}`)

let pollTimer = null

let generation = 0

let inverters = []

const unsupportedRegisters = new Set()

const SOCKET_TIMEOUT_MS = 5000

const TEST_TIMEOUT_MS = 3000

const RECONNECT_DEBOUNCE_MS = 250

const REGISTERS = {
  gridPower: { address: 30005, length: 2, decode: decodePower },
  batterySoc: { address: 30014, length: 1, decode: decodeSoc },
  sigenPvPower: { address: 30035, length: 2, decode: decodePower },
  ratedEnergyCapacity: { address: 30083, length: 2, decode: decodeEnergy32 },
  batterySoh: { address: 30087, length: 1, decode: decodeSoc },
  lifetimePv: { address: 30088, length: 4, decode: decodeEnergy64 },
  consumedToday: { address: 30092, length: 2, decode: decodeEnergy32 },
  lifetimeConsumed: { address: 30094, length: 4, decode: decodeEnergy64 },
  thirdPartyPvPower: { address: 30194, length: 2, decode: decodePower },
  lifetimeBatteryCharge: { address: 30200, length: 4, decode: decodeEnergy64 },
  lifetimeBatteryDischarge: { address: 30204, length: 4, decode: decodeEnergy64 },
  lifetimeGridImport: { address: 30216, length: 4, decode: decodeEnergy64 },
  lifetimeGridExport: { address: 30220, length: 4, decode: decodeEnergy64 },
  generalLoadPower: { address: 30282, length: 2, decode: decodePower },
  loadPower: { address: 30284, length: 2, decode: decodePower }
}
