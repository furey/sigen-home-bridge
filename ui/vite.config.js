import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const rootDir = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  const target = `http://localhost:${bridgePort(loadEnv(mode, rootDir, ''))}`
  return {
    plugins: [vue(), tailwindcss()],
    server: {
      proxy: {
        '/events': { target, changeOrigin: true },
        '/api': { target, changeOrigin: true },
        '/fulfillment': { target, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  }
})

const bridgePort = (env) => savedPort() ?? env.SERVER_PORT ?? 5163

const savedPort = () => {
  try {
    const dataDir = process.env.DATA_DIR ?? './data'
    const settings = JSON.parse(readFileSync(resolve(rootDir, dataDir, 'settings.json'), 'utf8'))
    return settings.server?.port ?? null
  } catch {
    return null
  }
}
