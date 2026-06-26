import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import qrcode from 'qrcode-terminal'
import QrCodeSvg from 'qrcode-svg'
import {
  Accessory,
  Bridge,
  Categories,
  Characteristic,
  HAPStorage,
  MDNSAdvertiser,
  Service,
  uuid
} from 'hap-nodejs'
import { config, HOMEKIT_METRICS } from './config.js'
import { getSettings } from './settings.js'
import { state } from './state.js'
import { getActiveAlertIds } from './alerts.js'

export const getPairing = () => {
  if (!pairingUri) return { uri: '', pin: getSettings().homekit.pin, qr: '' }
  pairingQr ??= toQrDataUri(pairingUri)
  return { uri: pairingUri, pin: pairingPin, qr: pairingQr }
}

export const startHomeKit = () => {
  const { name, pin, port, manufacturer, model, labels, bind } = getSettings().homekit
  powerUnit = getSettings().homekit.powerUnit
  mkdirSync(config.paths.hapPersist, { recursive: true })
  HAPStorage.setCustomStoragePath(config.paths.hapPersist)
  const bridge = new Bridge(name, uuid.generate(`sigen:${pin}`))
  const info = { manufacturer, model }
  addBattery(bridge, { label: nameFor('battery', labels), info })
  sensors = powerMetrics.map(({ key }) =>
    addSensor(bridge, { key, name: nameFor(key, labels), info }))
  alertContacts = getSettings().alerts.items
    .filter((item) => item.channels.homekit.enabled)
    .map((item) =>
      addContact(bridge, { id: item.id, label: item.channels.homekit.sensorName?.trim() || item.name, info }))
  bridge.publish({
    username: deriveUsername(pin),
    pincode: pin,
    port,
    category: Categories.BRIDGE,
    advertiser: MDNSAdvertiser.CIAO,
    bind: bind ?? config.homekit.bind,
    addIdentifyingMaterial: false
  }).catch((error) => console.log(`[homekit] disabled; publish failed: ${error.message}`))
  announce(bridge, pin)
  pushValues()
  setInterval(pushValues, PUSH_INTERVAL_MS)
}

const addBattery = (bridge, { label, info }) => {
  const accessory = buildAccessory({ name: label, key: 'battery', info })
  socHumidity = accessory.addService(Service.HumiditySensor, label)
  socHumidity.setPrimaryService(true)
  battery = accessory.addService(Service.Battery, label)
  battery.addCharacteristic(Characteristic.StatusFault)
  bridge.addBridgedAccessory(accessory)
}

const addSensor = (bridge, { key, name, info }) => {
  const accessory = buildAccessory({ name, key, info })
  const service = accessory.addService(Service.TemperatureSensor, name, key)
  service.getCharacteristic(Characteristic.CurrentTemperature).setProps(POWER_UNIT_PROPS[powerUnit])
  bridge.addBridgedAccessory(accessory)
  return { service, key }
}

const addContact = (bridge, { id, label, info }) => {
  const accessory = buildAccessory({ name: label, key: `alert-${id}`, info })
  const service = accessory.addService(Service.ContactSensor, label, id)
  bridge.addBridgedAccessory(accessory)
  return { service, id }
}

const buildAccessory = ({ name, key, info }) => {
  const accessory = new Accessory(name, uuid.generate(`sigen:${key}`))
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, info.manufacturer)
    .setCharacteristic(Characteristic.Model, info.model)
    .setCharacteristic(Characteristic.SerialNumber, `sigen-${key}`)
  return accessory
}

const nameFor = (key, labels) =>
  labels?.[key]?.trim() || HOMEKIT_METRICS.find((metric) => metric.key === key).defaultName

const pushValues = () => {
  socHumidity.updateCharacteristic(Characteristic.CurrentRelativeHumidity, clampPercent(state.batterySoc))
  battery.updateCharacteristic(Characteristic.BatteryLevel, clampPercent(state.batterySoc))
  battery.updateCharacteristic(Characteristic.StatusLowBattery, lowBattery(state.batterySoc))
  battery.updateCharacteristic(Characteristic.StatusFault, faultValue())
  for (const { service, key } of sensors) {
    service.updateCharacteristic(Characteristic.CurrentTemperature, powerReading(state[key]))
  }
  syncAlertContacts()
}

const syncAlertContacts = () => {
  if (!alertContacts.length) return
  const active = getActiveAlertIds()
  for (const { service, id } of alertContacts) {
    service.updateCharacteristic(Characteristic.ContactSensorState, contactState(active.has(id)))
  }
}

const announce = (bridge, pin) => {
  pairingUri = bridge.setupURI()
  pairingPin = pin
  console.log(`[homekit] pairing PIN: ${pin}`)
  qrcode.generate(pairingUri, { small: true }, (rendered) => console.log(rendered))
  console.log(`[homekit] setup URI: ${pairingUri}`)
}

const toQrDataUri = (text) => {
  const svg = new QrCodeSvg({ content: text, padding: 1, width: 320, height: 320, ecl: 'M' }).svg()
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const deriveUsername = (seed) =>
  createHash('sha256').update(`sigen:${seed}`).digest('hex')
    .slice(0, 12).match(/.{2}/g).join(':').toUpperCase()

const powerReading = (watts) =>
  powerUnit === 'watts' ? Math.round(watts) : watts / 1000

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)))

const lowBattery = (value) =>
  value < LOW_BATTERY_PERCENT
    ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
    : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL

const faultValue = () =>
  state.connected
    ? Characteristic.StatusFault.NO_FAULT
    : Characteristic.StatusFault.GENERAL_FAULT

const contactState = (active) =>
  active
    ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
    : Characteristic.ContactSensorState.CONTACT_DETECTED

let battery = null
let socHumidity = null
let powerUnit = 'kilowatts'
let sensors = []
let alertContacts = []
let pairingUri = ''
let pairingPin = ''
let pairingQr = null

const PUSH_INTERVAL_MS = 2000

const LOW_BATTERY_PERCENT = 20

const POWER_UNIT_PROPS = {
  kilowatts: { minValue: -1000, maxValue: 1000, minStep: 0.1 },
  watts: { minValue: -100000, maxValue: 100000, minStep: 1 }
}

const powerMetrics = HOMEKIT_METRICS.filter(({ key }) => key !== 'battery')
