import ModbusRTU from 'modbus-serial'
import { config } from './config.js'
import { deriveBatteryPower } from './modbus.js'

const probe = async () => {
  const client = new ModbusRTU()
  await client.connectTCP(config.sigen.host, { port: config.sigen.port })
  client.setTimeout(SOCKET_TIMEOUT_MS)
  console.log(`connected to ${config.sigen.host}:${config.sigen.port}\n`)
  const values = {}
  for (const group of buildGroups()) {
    console.log(groupHeader(group))
    client.setID(group.unitId)
    for (const register of group.registers) {
      const reading = await readRegister(client, register)
      if (reading.ok) values[register.key] = reading.value
      console.log(formatReading(register, reading))
    }
    console.log('')
  }
  printDerivedBatteryPower(values)
  printDeviceHint()
  client.close(() => process.exit(0))
}

const readRegister = async (client, { address, type, words }) => {
  try {
    const response = await client.readInputRegisters(address, words ?? WORD_SIZES[type])
    return { ok: true, value: DECODERS[type](response.buffer) }
  } catch (error) {
    return { ok: false, reason: shortError(error) }
  }
}

const buildGroups = () => {
  const groups = PLANT_GROUPS.map((group) => ({ ...group, unitId: config.sigen.unitId }))
  const inverterId = optionalUnit(process.env.SIGEN_INVERTER_ID)
  if (inverterId !== null) groups.push({ ...INVERTER_GROUP, unitId: inverterId })
  const chargerId = optionalUnit(process.env.SIGEN_AC_CHARGER_ID)
  if (chargerId !== null) groups.push({ ...AC_CHARGER_GROUP, unitId: chargerId })
  return groups
}

const printDerivedBatteryPower = ({ pvPower, thirdPartyPvPower, gridPower, loadPower }) => {
  if ([pvPower, gridPower, loadPower].some((value) => value === undefined)) return
  const solar = pvPower + (thirdPartyPvPower ?? 0)
  const derived = deriveBatteryPower({ pvPower: solar, gridPower, loadPower })
  console.log(`${'batteryPower'.padEnd(KEY_WIDTH)} derived  solar + grid - load  ${derived} W\n`)
}

const printDeviceHint = () => {
  if (process.env.SIGEN_INVERTER_ID && process.env.SIGEN_AC_CHARGER_ID) return
  console.log('hint: per-inverter (MPPT strings, cell temps) and EV-charger registers sit on their')
  console.log('      own unit IDs; set SIGEN_INVERTER_ID and/or SIGEN_AC_CHARGER_ID to sweep them')
}

const groupHeader = ({ label, unitId }) =>
  `── ${label} · unit ${unitId} ${'─'.repeat(Math.max(2, 44 - label.length))}`

const formatReading = (register, reading) => {
  const label = `${register.key.padEnd(KEY_WIDTH)} reg ${String(register.address).padEnd(6)}`
  return reading.ok
    ? `${label} ${present(register, reading.value)}`
    : `${label}  (${reading.reason})`
}

const present = ({ type, scale = 1, unit = '' }, value) => {
  if (type === 'string') return `"${value}"`
  const scaled = scale === 1 ? value : Number((value / scale).toFixed(2))
  return unit ? `${scaled} ${unit}` : `${scaled}`
}

const shortError = (error) =>
  error.message.replace(/^Modbus exception \d+: /, '') || error.message

const optionalUnit = (value) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

const SOCKET_TIMEOUT_MS = 5000

const KEY_WIDTH = 28

const WORD_SIZES = { u16: 1, s16: 1, u32: 2, s32: 2, u64: 4 }

const DECODERS = {
  u16: (buffer) => buffer.readUInt16BE(0),
  s16: (buffer) => buffer.readInt16BE(0),
  u32: (buffer) => buffer.readUInt32BE(0),
  s32: (buffer) => buffer.readInt32BE(0),
  u64: (buffer) => Number(buffer.readBigUInt64BE(0)),
  string: (buffer) => buffer.toString('ascii').replace(/[^\x20-\x7e]/g, '').trim()
}

const PLANT_GROUPS = [
  {
    label: 'System & status',
    registers: [
      { key: 'systemTime', address: 30000, type: 'u32', unit: 's epoch' },
      { key: 'emsWorkMode', address: 30003, type: 'u16' },
      { key: 'gridSensorStatus', address: 30004, type: 'u16' },
      { key: 'onOffGridStatus', address: 30009, type: 'u16' },
      { key: 'plantRatedActivePower', address: 30010, type: 'u32', unit: 'W' },
      { key: 'plantRatedApparentPower', address: 30012, type: 'u32', unit: 'VA' },
      { key: 'runningState', address: 30051, type: 'u16' },
      { key: 'gridRatedFrequency', address: 30276, type: 'u16', scale: 100, unit: 'Hz' },
      { key: 'gridRatedVoltage', address: 30277, type: 'u32', scale: 100, unit: 'V' },
      { key: 'alarm1', address: 30027, type: 'u16' },
      { key: 'alarm2', address: 30028, type: 'u16' },
      { key: 'alarm3', address: 30029, type: 'u16' },
      { key: 'alarm4', address: 30030, type: 'u16' },
      { key: 'alarm5', address: 30072, type: 'u16' },
      { key: 'alarm6', address: 30280, type: 'u16' },
      { key: 'alarm7', address: 30281, type: 'u16' }
    ]
  },
  {
    label: 'Power flows',
    registers: [
      { key: 'gridPower', address: 30005, type: 's32', unit: 'W' },
      { key: 'gridReactivePower', address: 30007, type: 's32', unit: 'var' },
      { key: 'plantActivePower', address: 30031, type: 's32', unit: 'W' },
      { key: 'plantReactivePower', address: 30033, type: 's32', unit: 'var' },
      { key: 'pvPower', address: 30035, type: 's32', unit: 'W' },
      { key: 'thirdPartyPvPower', address: 30194, type: 's32', unit: 'W' },
      { key: 'essPower', address: 30037, type: 's32', unit: 'W' },
      { key: 'generalLoadPower', address: 30282, type: 's32', unit: 'W' },
      { key: 'loadPower', address: 30284, type: 's32', unit: 'W' },
      { key: 'plantPhaseAActivePower', address: 30015, type: 's32', unit: 'W' },
      { key: 'plantPhaseBActivePower', address: 30017, type: 's32', unit: 'W' },
      { key: 'plantPhaseCActivePower', address: 30019, type: 's32', unit: 'W' },
      { key: 'plantPhaseAReactivePower', address: 30021, type: 's32', unit: 'var' },
      { key: 'plantPhaseBReactivePower', address: 30023, type: 's32', unit: 'var' },
      { key: 'plantPhaseCReactivePower', address: 30025, type: 's32', unit: 'var' }
    ]
  },
  {
    label: 'Battery & ESS',
    registers: [
      { key: 'batterySoc', address: 30014, type: 'u16', scale: 10, unit: '%' },
      { key: 'batterySoh', address: 30087, type: 'u16', scale: 10, unit: '%' },
      { key: 'ratedEnergyCapacity', address: 30083, type: 'u32', scale: 100, unit: 'kWh' },
      { key: 'availableChargeCapacity', address: 30064, type: 'u32', scale: 100, unit: 'kWh' },
      { key: 'availableDischargeCapacity', address: 30066, type: 'u32', scale: 100, unit: 'kWh' },
      { key: 'ratedChargePower', address: 30068, type: 'u32', unit: 'W' },
      { key: 'ratedDischargePower', address: 30070, type: 'u32', unit: 'W' },
      { key: 'availableMaxChargePower', address: 30047, type: 'u32', unit: 'W' },
      { key: 'availableMaxDischargePower', address: 30049, type: 'u32', unit: 'W' },
      { key: 'chargeCutOffSoc', address: 30085, type: 'u16', scale: 10, unit: '%' },
      { key: 'dischargeCutOffSoc', address: 30086, type: 'u16', scale: 10, unit: '%' },
      { key: 'avgCellTemp', address: 30286, type: 's16', scale: 10, unit: '°C' }
    ]
  },
  {
    label: 'Energy counters',
    registers: [
      { key: 'pvGeneratedToday', address: 30272, type: 'u32', scale: 100, unit: 'kWh' },
      { key: 'pvGeneratedPrevDay', address: 30274, type: 'u32', scale: 100, unit: 'kWh' },
      { key: 'consumedToday', address: 30092, type: 'u32', scale: 100, unit: 'kWh' },
      { key: 'lifetimePv', address: 30088, type: 'u64', scale: 100, unit: 'kWh' },
      { key: 'lifetimeConsumed', address: 30094, type: 'u64', scale: 100, unit: 'kWh' },
      { key: 'lifetimeGridImport', address: 30216, type: 'u64', scale: 100, unit: 'kWh' },
      { key: 'lifetimeGridExport', address: 30220, type: 'u64', scale: 100, unit: 'kWh' },
      { key: 'lifetimeBatteryCharge', address: 30200, type: 'u64', scale: 100, unit: 'kWh' },
      { key: 'lifetimeBatteryDischarge', address: 30204, type: 'u64', scale: 100, unit: 'kWh' }
    ]
  }
]

const INVERTER_GROUP = {
  label: 'Inverter',
  registers: [
    { key: 'model', address: 30500, type: 'string', words: 15 },
    { key: 'serialNumber', address: 30515, type: 'string', words: 10 },
    { key: 'firmwareVersion', address: 30525, type: 'string', words: 15 },
    { key: 'ratedActivePower', address: 30540, type: 'u32', unit: 'W' },
    { key: 'ratedBatteryCapacity', address: 30548, type: 'u32', scale: 100, unit: 'kWh' },
    { key: 'runningState', address: 30578, type: 'u16' },
    { key: 'activePower', address: 30587, type: 's32', unit: 'W' },
    { key: 'gridFrequency', address: 31002, type: 'u16', scale: 100, unit: 'Hz' },
    { key: 'pcsInternalTemp', address: 31003, type: 's16', scale: 10, unit: '°C' },
    { key: 'phaseAVoltage', address: 31011, type: 'u32', scale: 100, unit: 'V' },
    { key: 'phaseBVoltage', address: 31013, type: 'u32', scale: 100, unit: 'V' },
    { key: 'phaseCVoltage', address: 31015, type: 'u32', scale: 100, unit: 'V' },
    { key: 'phaseACurrent', address: 31017, type: 's32', scale: 100, unit: 'A' },
    { key: 'phaseBCurrent', address: 31019, type: 's32', scale: 100, unit: 'A' },
    { key: 'phaseCCurrent', address: 31021, type: 's32', scale: 100, unit: 'A' },
    { key: 'pv1Voltage', address: 31027, type: 's16', scale: 10, unit: 'V' },
    { key: 'pv1Current', address: 31028, type: 's16', scale: 100, unit: 'A' },
    { key: 'pv2Voltage', address: 31029, type: 's16', scale: 10, unit: 'V' },
    { key: 'pv2Current', address: 31030, type: 's16', scale: 100, unit: 'A' },
    { key: 'pv3Voltage', address: 31031, type: 's16', scale: 10, unit: 'V' },
    { key: 'pv3Current', address: 31032, type: 's16', scale: 100, unit: 'A' },
    { key: 'pv4Voltage', address: 31033, type: 's16', scale: 10, unit: 'V' },
    { key: 'pv4Current', address: 31034, type: 's16', scale: 100, unit: 'A' },
    { key: 'inverterBatterySoc', address: 30601, type: 'u16', scale: 10, unit: '%' },
    { key: 'inverterBatterySoh', address: 30602, type: 'u16', scale: 10, unit: '%' },
    { key: 'inverterAvgCellTemp', address: 30603, type: 's16', scale: 10, unit: '°C' },
    { key: 'maxCellTemp', address: 30620, type: 's16', scale: 10, unit: '°C' },
    { key: 'minCellTemp', address: 30621, type: 's16', scale: 10, unit: '°C' }
  ]
}

const AC_CHARGER_GROUP = {
  label: 'EV AC charger',
  registers: [
    { key: 'systemState', address: 32000, type: 'u16' },
    { key: 'totalEnergyConsumed', address: 32001, type: 'u32', scale: 100, unit: 'kWh' },
    { key: 'chargingPower', address: 32003, type: 's32', unit: 'W' },
    { key: 'ratedPower', address: 32005, type: 'u32', unit: 'W' },
    { key: 'ratedCurrent', address: 32007, type: 's32', scale: 100, unit: 'A' },
    { key: 'ratedVoltage', address: 32009, type: 'u16', scale: 10, unit: 'V' }
  ]
}

probe().catch((error) => {
  console.error(`probe failed: ${error.message}`)
  process.exit(1)
})
