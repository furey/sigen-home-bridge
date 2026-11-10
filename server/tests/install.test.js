import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const installEnv = ({ root, bin, log }) => ({
  PATH: `${bin}:/usr/bin:/bin`, REPO, DOCKER_LOG: log, NO_COLOR: '1', HOME: root
})

const runInstall = (sandbox) => spawnSync('sh', [INSTALL], {
  cwd: sandbox.root,
  detached: true,
  encoding: 'utf8',
  env: installEnv(sandbox)
})

const TTY_DRIVER = `
import os, pty, select, signal, sys, time
replies = [(prompt.encode(), key.encode()) for prompt, key in zip(sys.argv[2::2], sys.argv[3::2])]
pid, fd = pty.fork()
if pid == 0:
    os.execvp('sh', ['sh', sys.argv[1]])
seen = b''
deadline = time.time() + 10
while time.time() < deadline:
    ready, _, _ = select.select([fd], [], [], 0.2)
    if not ready:
        continue
    try:
        chunk = os.read(fd, 1024)
    except OSError:
        break
    if not chunk:
        break
    seen += chunk
    if replies and replies[0][0] in seen:
        time.sleep(0.2)
        os.write(fd, replies.pop(0)[1])
if time.time() >= deadline:
    os.kill(pid, signal.SIGKILL)
os.waitpid(pid, 0)
sys.stdout.write(seen.decode(errors='replace'))
`

const runInstallAtTerminal = (sandbox, replies) => spawnSync(
  'python3',
  ['-c', TTY_DRIVER, INSTALL, ...replies.flat()],
  { cwd: sandbox.root, encoding: 'utf8', env: installEnv(sandbox) }
)

const useStub = ({ bin }, name, body) => {
  writeFileSync(join(bin, name), body)
  chmodSync(join(bin, name), 0o755)
}

const seedInstall = (sandbox, compose) => {
  mkdirSync(sandbox.dir)
  writeFileSync(join(sandbox.dir, 'compose.yaml'), compose)
  writeFileSync(join(sandbox.dir, '.env'), 'SERVER_PORT=6000\n')
}

const readInstalled = ({ dir }, name) => readFileSync(join(dir, name), 'utf8')

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

  it('keeps a changed compose.yaml and the .env on a re-run with no terminal to ask', () => {
    const sandbox = makeSandbox()
    seedInstall(sandbox, 'mine\n')
    const result = runInstall(sandbox)
    expect(readInstalled(sandbox, 'compose.yaml')).toBe('mine\n')
    expect(readInstalled(sandbox, '.env')).toBe('SERVER_PORT=6000\n')
    expect(existsSync(join(sandbox.dir, 'compose.yaml.next'))).toBe(false)
    expect(existsSync(join(sandbox.dir, 'compose.yaml.bak'))).toBe(false)
    expect(result.stdout).toContain('http://192.168.1.50:6000')
  })

  it('reports an unchanged compose.yaml as up to date without asking', () => {
    const sandbox = makeSandbox()
    seedInstall(sandbox, readFileSync(join(REPO, 'compose.yaml'), 'utf8'))
    const result = runInstall(sandbox)
    expect(result.stdout).toContain('compose.yaml is up to date')
    expect(result.stdout).not.toContain('differs from the latest version')
    expect(existsSync(join(sandbox.dir, 'compose.yaml.bak'))).toBe(false)
  })

  it('replaces a changed compose.yaml after a yes and keeps the old copy', () => {
    const sandbox = makeSandbox()
    seedInstall(sandbox, 'mine\n')
    const result = runInstallAtTerminal(sandbox, [['[y/N]', 'y'], ['Start now?', 'n']])
    expect(result.stdout).toContain('updated compose.yaml (old copy: compose.yaml.bak)')
    expect(readInstalled(sandbox, 'compose.yaml'))
      .toBe(readFileSync(join(REPO, 'compose.yaml'), 'utf8'))
    expect(readInstalled(sandbox, 'compose.yaml.bak')).toBe('mine\n')
  })

  it('keeps a changed compose.yaml after a no', () => {
    const sandbox = makeSandbox()
    seedInstall(sandbox, 'mine\n')
    const result = runInstallAtTerminal(sandbox, [['[y/N]', 'n'], ['Start now?', 'n']])
    expect(result.stdout).toContain('keeping the existing compose.yaml')
    expect(readInstalled(sandbox, 'compose.yaml')).toBe('mine\n')
    expect(existsSync(join(sandbox.dir, 'compose.yaml.bak'))).toBe(false)
    expect(existsSync(join(sandbox.dir, 'compose.yaml.next'))).toBe(false)
  })

  it('cancels without changes when Esc is pressed at the replace prompt', () => {
    const sandbox = makeSandbox()
    seedInstall(sandbox, 'mine\n')
    const result = runInstallAtTerminal(sandbox, [['[y/N]', '\u001b']])
    expect(result.stdout).toContain('cancelled. Nothing changed.')
    expect(readInstalled(sandbox, 'compose.yaml')).toBe('mine\n')
    expect(existsSync(join(sandbox.dir, 'compose.yaml.next'))).toBe(false)
    expect(readFileSync(sandbox.log, 'utf8')).not.toContain('compose up')
  })

  it('keeps compose.yaml and still starts when the download fails on a re-run', () => {
    const sandbox = makeSandbox()
    seedInstall(sandbox, 'mine\n')
    useStub(sandbox, 'curl', '#!/bin/sh\nexit 6\n')
    const result = runInstall(sandbox)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('could not check for a newer compose.yaml')
    expect(readInstalled(sandbox, 'compose.yaml')).toBe('mine\n')
    expect(existsSync(join(sandbox.dir, 'compose.yaml.next'))).toBe(false)
    const calls = readFileSync(sandbox.log, 'utf8').trim().split('\n')
    expect(calls.slice(-2)).toEqual(['compose pull sigen-home-bridge', 'compose up -d'])
  })

  it('tells Docker Desktop users on a Mac to turn on host networking', () => {
    const sandbox = makeSandbox()
    useStub(sandbox, 'uname', '#!/bin/sh\necho Darwin\n')
    useStub(sandbox, 'docker', `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
[ "$1" = info ] && echo 'Docker Desktop'
exit 0
`)
    const result = runInstall(sandbox)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Docker Desktop needs host networking turned on')
  })

  it('says nothing about Docker Desktop on Linux', () => {
    const result = runInstall(makeSandbox())
    expect(result.stdout).not.toContain('Docker Desktop')
  })
})
