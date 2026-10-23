import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    execFile: (...a: unknown[]) => execFileMock(...a),
    spawn: (...a: unknown[]) => spawnMock(...a),
  }
})

import { binaryEnv, resolveBinaryPath, resolveAndRunStreamed, _resetShellPathCacheForTesting } from '../lsp/shellPath'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

// resolveAndRunStreamed awaits resolveBinaryPath() (itself promise-based)
// before calling spawn() — give that a tick to settle so spawn()'s listeners
// are attached before a test emits a simulated process event.
function waitForSpawn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  execFileMock.mockReset()
  spawnMock.mockReset()
  _resetShellPathCacheForTesting()
})

describe('resolveBinaryPath', () => {
  it('caches a successful resolution across calls for the same command', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/usr/local/bin/gopls\n')
    })

    const first = await resolveBinaryPath('gopls')
    const second = await resolveBinaryPath('gopls')

    expect(first).toBe('/usr/local/bin/gopls')
    expect(second).toBe('/usr/local/bin/gopls')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('resolves null (and does not cache) when the shell cannot find the command', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(new Error('not found'), '')
    })

    const first = await resolveBinaryPath('rust-analyzer')
    const second = await resolveBinaryPath('rust-analyzer')

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('caches resolutions independently per command', async () => {
    execFileMock.mockImplementation((_shell: string, args: string[], cb: (err: Error | null, stdout: string) => void) => {
      const cmd = args[1] as string
      if (cmd.includes('gopls')) cb(null, '/usr/local/bin/gopls\n')
      else cb(null, '/usr/local/bin/rust-analyzer\n')
    })

    const gopls = await resolveBinaryPath('gopls')
    const rustAnalyzer = await resolveBinaryPath('rust-analyzer')

    expect(gopls).toBe('/usr/local/bin/gopls')
    expect(rustAnalyzer).toBe('/usr/local/bin/rust-analyzer')
  })
})

describe('resolveAndRunStreamed', () => {
  it('streams stdout and stderr chunks and resolves on a zero exit code', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/usr/local/bin/npm\n')
    })
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const chunks: string[] = []
    const done = resolveAndRunStreamed('npm', ['install', '-g', 'gopls'], (c) => chunks.push(c))
    await waitForSpawn()

    proc.stdout.emit('data', Buffer.from('installing...\n'))
    proc.stderr.emit('data', Buffer.from('warning: foo\n'))
    proc.emit('close', 0)

    await expect(done).resolves.toBeUndefined()
    expect(chunks).toEqual(['installing...\n', 'warning: foo\n'])
    expect(spawnMock).toHaveBeenCalledWith('/usr/local/bin/npm', ['install', '-g', 'gopls'], expect.anything())
  })

  it('rejects with a clear message when the binary is missing (ENOENT)', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(new Error('not found'), '')
    })
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const done = resolveAndRunStreamed('go', ['install', 'gopls'], () => {})
    await waitForSpawn()
    const err = Object.assign(new Error('spawn go ENOENT'), { code: 'ENOENT' })
    proc.emit('error', err)

    await expect(done).rejects.toThrow("'go' not found in PATH.")
  })

  it('rejects on a non-zero exit code', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/usr/local/bin/npm\n')
    })
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const done = resolveAndRunStreamed('npm', ['install', '-g', 'pyright'], () => {})
    await waitForSpawn()
    proc.emit('close', 1)

    await expect(done).rejects.toThrow('npm exited with code 1')
  })
  it('puts the binary folder on PATH so `#!/usr/bin/env node` scripts find node', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/opt/homebrew/bin/npm\n')
    })
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const done = resolveAndRunStreamed('npm', ['install', '-g', 'pyright'], () => {})
    await waitForSpawn()
    proc.emit('close', 0)
    await done

    const opts = spawnMock.mock.calls[0][2] as { env: NodeJS.ProcessEnv }
    expect(opts.env.PATH?.split(':')[0]).toBe('/opt/homebrew/bin')
  })
})

describe('binaryEnv', () => {
  it('leaves the env alone for an unresolved bare command', () => {
    expect(binaryEnv('npm')).toBe(process.env)
  })
})
