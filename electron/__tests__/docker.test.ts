import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { execFileMock, shellResolution } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  // What the login-shell `command -v docker` resolution should yield;
  // defaults to "not found" so existing tests exercise the bare-name
  // fallback. Tests can override per-case to exercise the resolved path.
  shellResolution: { value: null as string | null },
}))

// dockerBin() (electron/docker.ts) resolves 'docker' via resolveBinaryPath()
// (electron/lsp/shellPath.ts) before every real docker invocation, so every
// test in this file drives two execFile calls: the login-shell resolution
// (args = [shell, ['-lic', 'command -v docker'], cb]) and the actual docker
// command (args = [bin, dockerArgs, cb]). Route by shape rather than by
// literal binary name so tests stay agnostic to whether resolution succeeds.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    execFile: (...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: unknown, result: unknown) => void
      const isShellResolution = Array.isArray(args[1]) && (args[1] as unknown[])[0] === '-lic'
      if (isShellResolution) {
        if (shellResolution.value) cb(null, shellResolution.value)
        else cb(new Error('not found'), '')
        return
      }
      const result = execFileMock(...args.slice(0, -1))
      if (result instanceof Error) cb(result, { stdout: '', stderr: '' })
      else cb(null, result)
    },
  }
})

import {
  checkDockerStatus,
  listContainers,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  startContainers,
  stopContainers,
  removeContainers,
  openDockerApp,
} from '../docker'
import { _resetShellPathCacheForTesting } from '../lsp/shellPath'

describe('checkDockerStatus', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    shellResolution.value = null
    _resetShellPathCacheForTesting()
  })

  it('returns "running" when docker info succeeds', async () => {
    execFileMock.mockReturnValue({ stdout: 'abc123', stderr: '' })
    expect(await checkDockerStatus()).toBe('running')
  })

  it('returns "not-installed" when the docker binary is missing (ENOENT)', async () => {
    const err = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' })
    execFileMock.mockReturnValue(err)
    expect(await checkDockerStatus()).toBe('not-installed')
  })

  it('returns "stopped" when the CLI exists but the daemon is unreachable', async () => {
    const err = Object.assign(new Error('Cannot connect to the Docker daemon'), { code: 1 })
    execFileMock.mockReturnValue(err)
    expect(await checkDockerStatus()).toBe('stopped')
  })
})

describe('listContainers', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    shellResolution.value = null
    _resetShellPathCacheForTesting()
  })

  it('parses newline-delimited JSON rows from docker ps', async () => {
    const row1 = JSON.stringify({ ID: 'a1', Names: 'web', Image: 'nginx', Status: 'Up 2 hours', State: 'running', Ports: '80/tcp' })
    const row2 = JSON.stringify({ ID: 'b2', Names: 'db', Image: 'postgres', Status: 'Exited', State: 'exited', Ports: '' })
    execFileMock.mockReturnValue({ stdout: `${row1}\n${row2}\n`, stderr: '' })

    const containers = await listContainers()
    expect(containers).toEqual([
      { id: 'a1', name: 'web', image: 'nginx', status: 'Up 2 hours', state: 'running', ports: '80/tcp' },
      { id: 'b2', name: 'db', image: 'postgres', status: 'Exited', state: 'exited', ports: '' },
    ])
  })

  it('returns an empty list on failure', async () => {
    execFileMock.mockReturnValue(new Error('daemon not running'))
    expect(await listContainers()).toEqual([])
  })

  it('extracts the compose project from the Labels field', async () => {
    const row = JSON.stringify({
      ID: 'a1',
      Names: 'gpt-webapp-caddy-1',
      Image: 'caddy',
      Status: 'Up',
      State: 'running',
      Ports: '',
      Labels: 'com.docker.compose.service=caddy,com.docker.compose.project=gpt-webapp,com.docker.compose.version=2.20',
    })
    execFileMock.mockReturnValue({ stdout: `${row}\n`, stderr: '' })

    const [container] = await listContainers()
    expect(container.project).toBe('gpt-webapp')
  })

  it('leaves project undefined for containers with no compose label', async () => {
    const row = JSON.stringify({
      ID: 'a1', Names: 'web', Image: 'nginx', Status: 'Up', State: 'running', Ports: '', Labels: '',
    })
    execFileMock.mockReturnValue({ stdout: `${row}\n`, stderr: '' })

    const [container] = await listContainers()
    expect(container.project).toBeUndefined()
  })
})

describe('container action commands', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    shellResolution.value = null
    _resetShellPathCacheForTesting()
  })

  it('startContainer reports ok on success', async () => {
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    expect(await startContainer('a1')).toEqual({ ok: true })
    expect(execFileMock).toHaveBeenCalledWith('docker', ['start', 'a1'])
  })

  it('stopContainer surfaces stderr on failure', async () => {
    const err = Object.assign(new Error('fail'), { stderr: 'no such container' })
    execFileMock.mockReturnValue(err)
    expect(await stopContainer('missing')).toEqual({ ok: false, error: 'no such container' })
  })

  it('restartContainer calls docker restart', async () => {
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    await restartContainer('a1')
    expect(execFileMock).toHaveBeenCalledWith('docker', ['restart', 'a1'])
  })

  it('removeContainer force-removes so a running container can be deleted in one step', async () => {
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    await removeContainer('a1')
    expect(execFileMock).toHaveBeenCalledWith('docker', ['rm', '-f', 'a1'])
  })

  it('startContainers starts every id in a single call', async () => {
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    expect(await startContainers(['a1', 'b2'])).toEqual({ ok: true })
    expect(execFileMock).toHaveBeenCalledWith('docker', ['start', 'a1', 'b2'])
  })

  it('stopContainers stops every id in a single call', async () => {
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    expect(await stopContainers(['a1', 'b2'])).toEqual({ ok: true })
    expect(execFileMock).toHaveBeenCalledWith('docker', ['stop', 'a1', 'b2'])
  })

  it('removeContainers force-removes every id in a single call', async () => {
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    expect(await removeContainers(['a1', 'b2'])).toEqual({ ok: true })
    expect(execFileMock).toHaveBeenCalledWith('docker', ['rm', '-f', 'a1', 'b2'])
  })
})

describe('dockerBin PATH resolution', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    shellResolution.value = null
    _resetShellPathCacheForTesting()
  })

  it('runs docker commands against the login-shell-resolved path when the bare name is not on PATH', async () => {
    shellResolution.value = '/opt/homebrew/bin/docker\n'
    execFileMock.mockReturnValue({ stdout: 'abc123', stderr: '' })

    expect(await checkDockerStatus()).toBe('running')
    expect(execFileMock).toHaveBeenCalledWith('/opt/homebrew/bin/docker', ['info', '--format', '{{.ID}}'], { timeout: 5000 })
  })

  it('falls back to the bare "docker" name so a genuinely missing binary still reports not-installed', async () => {
    shellResolution.value = null
    const err = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' })
    execFileMock.mockReturnValue(err)

    expect(await checkDockerStatus()).toBe('not-installed')
    expect(execFileMock).toHaveBeenCalledWith('docker', ['info', '--format', '{{.ID}}'], { timeout: 5000 })
  })
})

describe('openDockerApp', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    execFileMock.mockReset()
    shellResolution.value = null
    _resetShellPathCacheForTesting()
  })
  afterEach(() => Object.defineProperty(process, 'platform', { value: originalPlatform }))

  it('opens Docker.app on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    expect(await openDockerApp()).toEqual({ ok: true })
    expect(execFileMock).toHaveBeenCalledWith('open', ['-a', 'Docker'])
  })

  it('uses systemctl on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    execFileMock.mockReturnValue({ stdout: '', stderr: '' })
    expect(await openDockerApp()).toEqual({ ok: true })
    expect(execFileMock).toHaveBeenCalledWith('systemctl', ['--user', 'start', 'docker'])
  })
})
