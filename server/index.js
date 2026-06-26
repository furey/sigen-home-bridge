import { mkdirSync } from 'node:fs'
import { config } from './config.js'
import { loadSettings, getSettings } from './settings.js'
import { startHistory } from './history.js'
import { startModbusPoller } from './modbus.js'
import { startHomeKit } from './homekit.js'
import { startHttpServer } from './server.js'
import { startWeather } from './weather.js'
import { startAlerts } from './alerts.js'

const main = () => {
  mkdirSync(config.paths.data, { recursive: true })
  loadSettings()
  startHistory()
  startModbusPoller()
  startHomeKit()
  startHttpServer()
  startWeather()
  startAlerts()
  announce()
}

const announce = () => {
  console.log(`[sigen-home-bridge] gateway ${config.sigen.host}:${config.sigen.port}`)
  console.log(`[sigen-home-bridge] dashboard http://localhost:${getSettings().server.port}`)
  console.log(`[sigen-home-bridge] data ${config.paths.data}`)
}

main()
