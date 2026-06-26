export const discoverInverters = async (client, options = {}) => {
  const sweepMax = options.sweepMax ?? INVERTER_SWEEP_MAX
  const timeoutMs = options.timeoutMs ?? DISCOVERY_TIMEOUT_MS
  client.setTimeout(timeoutMs)
  const found = []
  for (let unitId = 1; unitId <= sweepMax; unitId++) {
    const identity = await identify(client, unitId)
    if (identity) found.push({ unitId, ...identity })
  }
  return found
}

export const readInverter = async (client, device) => {
  client.setID(device.unitId)
  const strings = await readStrings(client, device.stringCount)
  return {
    type: 'inverter',
    unitId: device.unitId,
    model: device.model,
    serial: device.serial,
    status: statusLabel(await readU16(client, RUNNING_STATE)),
    activePower: await readS32(client, ACTIVE_POWER),
    solarPower: sumStringPower(strings),
    temperature: await readScaled(client, PCS_TEMP, TEMP_SCALE),
    soc: await readScaled(client, SOC, PERCENT_SCALE),
    soh: await readScaled(client, SOH, PERCENT_SCALE),
    strings
  }
}

const identify = async (client, unitId) => {
  try {
    client.setID(unitId)
    const model = decodeText(await read(client, MODEL))
    if (!model) return null
    const serial = decodeText(await read(client, SERIAL))
    const stringCount = clampStringCount(await readU16(client, STRING_COUNT))
    return { model, serial, stringCount }
  } catch {
    return null
  }
}

const readStrings = async (client, stringCount) => {
  if (stringCount < 1) return []
  const block = await read(client, { address: STRING_BLOCK, length: stringCount * WORDS_PER_STRING })
  return Array.from({ length: stringCount }, (_, slot) => buildString(block, slot))
}

const buildString = (block, slot) => {
  const offset = slot * BYTES_PER_STRING
  const voltage = round(block.readInt16BE(offset) / VOLTAGE_SCALE, 1)
  const current = round(block.readInt16BE(offset + WORD_BYTES) / CURRENT_SCALE, 2)
  return { index: slot + 1, voltage, current, power: Math.round(voltage * current) }
}

const read = async (client, { address, length }) =>
  (await client.readInputRegisters(address, length)).buffer

const readU16 = async (client, register) => (await read(client, register)).readUInt16BE(0)

const readS32 = async (client, register) => (await read(client, register)).readInt32BE(0)

const readScaled = async (client, register, divisor) =>
  round((await read(client, register)).readInt16BE(0) / divisor, 1)

const decodeText = (buffer) => buffer.toString('ascii').replace(/[^\x20-\x7e]/g, '').trim()

const statusLabel = (raw) => RUNNING_STATES[raw] ?? 'unknown'

const sumStringPower = (strings) => strings.reduce((total, string) => total + string.power, 0)

const clampStringCount = (count) => Math.max(0, Math.min(count, MAX_STRINGS))

const round = (value, places) => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

const INVERTER_SWEEP_MAX = 4

const DISCOVERY_TIMEOUT_MS = 800

const MAX_STRINGS = 4

const WORDS_PER_STRING = 2

const WORD_BYTES = 2

const BYTES_PER_STRING = 4

const VOLTAGE_SCALE = 10

const CURRENT_SCALE = 100

const TEMP_SCALE = 10

const PERCENT_SCALE = 10

const STRING_BLOCK = 31027

const MODEL = { address: 30500, length: 15 }

const SERIAL = { address: 30515, length: 10 }

const STRING_COUNT = { address: 31025, length: 1 }

const RUNNING_STATE = { address: 30578, length: 1 }

const ACTIVE_POWER = { address: 30587, length: 2 }

const PCS_TEMP = { address: 31003, length: 1 }

const SOC = { address: 30601, length: 1 }

const SOH = { address: 30602, length: 1 }

const RUNNING_STATES = { 0: 'standby', 1: 'running', 2: 'fault', 3: 'shutdown' }
