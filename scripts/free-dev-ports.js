import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const freeDevPorts = () => {
  for (const port of devPorts()) {
    for (const pid of listenerPids(port)) {
      process.kill(pid)
      console.log(`[predev] killed stale listener ${pid} on port ${port}`)
    }
  }
}

const devPorts = () => {
  const settings = readSettings()
  return [...new Set([
    Number(settings?.homekit?.port) || DEFAULT_HOMEKIT_PORT,
    Number(settings?.server?.port) || DEFAULT_SERVER_PORT
  ])]
}

const readSettings = () => {
  try {
    return JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url)))
  } catch {
    return null
  }
}

const listenerPids = (port) => {
  try {
    return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')
      .filter(Boolean)
      .map(Number)
  } catch {
    return []
  }
}

const DEFAULT_HOMEKIT_PORT = 51826

const DEFAULT_SERVER_PORT = 5163

freeDevPorts()
