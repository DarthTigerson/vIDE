// electron/__tests__/llama.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { ipcHandlers, spawnMock, execFileMock } = vi.hoisted(() => ({
  ipcHandlers: {} as Record<string, (...args: any[]) => unknown>,
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      ipcHandlers[channel] = fn
    },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => sender,
  },
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: (...a: unknown[]) => spawnMock(...a),
    execFile: (...a: unknown[]) => execFileMock(...a),
  }
})

import { LlamaManager, resolveLlamaPath, _resetLlamaPathCacheForTesting } from '../llama'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('LlamaManager', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    execFileMock.mockReset()
    _resetLlamaPathCacheForTesting()
    // Default: login-shell resolution fails, so callers fall back to the
    // bare 'llama-server' command name.
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(new Error('not found'), '')
    })
  })

  it('isAvailable resolves true when the process spawns successfully', async () => {
    const manager = new LlamaManager()
    manager.registerHandlers()
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const promise = ipcHandlers['llama:isAvailable']({})
    await flushMicrotasks()
    proc.emit('spawn')
    await expect(promise).resolves.toBe(true)
    expect(spawnMock).toHaveBeenCalledWith('llama-server', ['--help'], expect.any(Object))
  })

  it('isAvailable resolves false when the binary is missing (ENOENT)', async () => {
    const manager = new LlamaManager()
    manager.registerHandlers()
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const promise = ipcHandlers['llama:isAvailable']({})
    await flushMicrotasks()
    proc.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
    await expect(promise).resolves.toBe(false)
  })

  it('isAvailable spawns the resolved absolute path when login-shell resolution succeeds', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/opt/homebrew/bin/llama-server\n')
    })
    const manager = new LlamaManager()
    manager.registerHandlers()
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const promise = ipcHandlers['llama:isAvailable']({})
    await flushMicrotasks()
    proc.emit('spawn')
    await expect(promise).resolves.toBe(true)
    expect(spawnMock).toHaveBeenCalledWith('/opt/homebrew/bin/llama-server', ['--help'], expect.any(Object))
  })

  describe('resolveLlamaPath', () => {
    it('resolves the absolute path from the login shell and caches it', async () => {
      execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
        cb(null, '/opt/homebrew/bin/llama-server\n')
      })
      const first = await resolveLlamaPath()
      const second = await resolveLlamaPath()
      expect(first).toBe('/opt/homebrew/bin/llama-server')
      expect(second).toBe('/opt/homebrew/bin/llama-server')
      // Cached: only one login-shell resolution.
      expect(execFileMock).toHaveBeenCalledTimes(1)
    })

    it('resolves null when the login shell cannot find any llama binary', async () => {
      const resolved = await resolveLlamaPath()
      expect(resolved).toBeNull()
    })

    it('falls back to llama-cli when llama-server is absent', async () => {
      execFileMock.mockImplementation((_shell: string, args: string[], cb: (err: Error | null, stdout: string) => void) => {
        // Verify the probe checks both binaries.
        expect(args[1]).toContain('llama-server')
        expect(args[1]).toContain('llama-cli')
        cb(null, '/usr/local/bin/llama-cli\n')
      })
      const resolved = await resolveLlamaPath()
      expect(resolved).toBe('/usr/local/bin/llama-cli')
    })
  })
})
