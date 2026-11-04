import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dataDir = fileURLToPath(new URL('../../tmp/test-data-google-token', import.meta.url))

process.env.DATA_DIR = dataDir
process.env.GOOGLE_AUTH_TOKEN = ''

rmSync(dataDir, { recursive: true, force: true })

const { loadSettings, getSettings, updateSettings } = await import('../settings.js')
const { warnIfPublicGoogleToken } = await import('../oauth.js')

afterEach(() => vi.restoreAllMocks())

describe('google auth token seed', () => {
  it('seeds a random token when the env value is blank', () => {
    const { authToken } = loadSettings().google
    expect(authToken).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('public default token warning', () => {
  it('warns when the token is the public default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    updateSettings({ google: { authToken: 'sigen-home-bridge-token' } })
    warnIfPublicGoogleToken()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[google\] .*\/token.*long random value/))
  })

  it('stays quiet for any other token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    updateSettings({ google: { authToken: 'a-long-random-value' } })
    warnIfPublicGoogleToken()
    expect(getSettings().google.authToken).toBe('a-long-random-value')
    expect(warn).not.toHaveBeenCalled()
  })
})
