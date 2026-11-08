import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const INSTALL = join(REPO, 'install.sh')

const stubs = {
  docker: `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
exit 0
`,
  curl: `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -o) shift; out="$1" ;;
    http*) url="$1" ;;
  esac
  shift
done
cp "$REPO/\${url##*/}" "$out"
`,
  uname: `#!/bin/sh
echo Linux
`,
  ip: `#!/bin/sh
echo '1.1.1.1 via 192.168.1.1 dev eth0 src 192.168.1.50 uid 1000'
`,
  hostname: `#!/bin/sh
echo '192.168.1.50 172.17.0.1'
`,
  timedatectl: `#!/bin/sh
echo Australia/Sydney
`
}

const sandboxes = []

const makeSandbox = () => {
  const root = mkdtempSync(join(tmpdir(), 'sigen-install-'))
  sandboxes.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  Object.entries(stubs).forEach(([name, body]) => {
    writeFileSync(join(bin, name), body)
    chmodSync(join(bin, name), 0o755)
  })
  return { root, bin, dir: join(root, 'sigen-home-bridge'), log: join(root, 'docker.log') }
}

const runInstall = ({ root, bin, log }) => spawnSync('sh', [INSTALL], {
  cwd: root,
  detached: true,
  encoding: 'utf8',
  env: { PATH: `${bin}:/usr/bin:/bin`, REPO, DOCKER_LOG: log, NO_COLOR: '1', HOME: root }
})

afterEach(() => {
  sandboxes.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

describe('install.sh', () => {
  it('downloads compose.yaml into a new sigen-home-bridge folder', () => {
    const sandbox = makeSandbox()
    const result = runInstall(sandbox)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(sandbox.dir, 'compose.yaml'), 'utf8'))
      .toBe(readFileSync(join(REPO, 'compose.yaml'), 'utf8'))
  })

  it('writes .env from .env.example with the host time zone and LAN interface', () => {
    const sandbox = makeSandbox()
    runInstall(sandbox)
    const env = readFileSync(join(sandbox.dir, '.env'), 'utf8')
    const expected = readFileSync(join(REPO, '.env.example'), 'utf8')
      .replace(/^TZ=.*$/m, 'TZ=Australia/Sydney')
      .replace(/^# HOMEKIT_BIND=eth0$/m, 'HOMEKIT_BIND=eth0')
    expect(env).toMatch(/^TZ=Australia\/Sydney$/m)
    expect(env).toMatch(/^HOMEKIT_BIND=eth0$/m)
    expect(env).toBe(expected)
  })

  it('pulls the bridge image, starts it, and prints the dashboard address', () => {
    const sandbox = makeSandbox()
    const result = runInstall(sandbox)
    const calls = readFileSync(sandbox.log, 'utf8').trim().split('\n')
    expect(calls.slice(-2)).toEqual(['compose pull sigen-home-bridge', 'compose up -d'])
    expect(result.stdout).toContain('http://192.168.1.50:5163')
  })

  it('keeps an existing compose.yaml and .env on a re-run', () => {
    const sandbox = makeSandbox()
    mkdirSync(sandbox.dir)
    writeFileSync(join(sandbox.dir, 'compose.yaml'), 'mine\n')
    writeFileSync(join(sandbox.dir, '.env'), 'SERVER_PORT=6000\n')
    const result = runInstall(sandbox)
    expect(readFileSync(join(sandbox.dir, 'compose.yaml'), 'utf8')).toBe('mine\n')
    expect(readFileSync(join(sandbox.dir, '.env'), 'utf8')).toBe('SERVER_PORT=6000\n')
    expect(result.stdout).toContain('http://192.168.1.50:6000')
  })
})
