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

import { homedir } from 'os'
import { LlamaManager, resolveLlamaPath, _resetLlamaPathCacheForTesting } from '../llama'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
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

  describe('llama:start', () => {
    const existingFile = __filename // a path that existsSync() will accept

    it('spawns llama-server with the config translated into launch args', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const proc = new FakeChildProcess()
      spawnMock.mockReturnValue(proc)
      const win = { webContents: { send: vi.fn() }, isDestroyed: () => false }

      await ipcHandlers['llama:start']({ sender: win }, 'model-1', {
        modelPath: existingFile,
        serverExecutable: '',
        host: '127.0.0.1',
        port: 8899,
        apiKey: 'local',
        contextSize: 131072,
        batchSize: 256,
        gpuLayers: 99,
        parallelRequests: 1,
        reasoningEffort: 'medium',
        alias: 'cosmos',
      })

      expect(spawnMock).toHaveBeenCalledWith(
        'llama-server',
        [
          '-m', existingFile,
          '-c', '131072',
          '--batch-size', '256',
          '-ngl', '99',
          '-np', '1',
          '--reasoning-effort', 'medium',
          '--host', '127.0.0.1',
          '--port', '8899',
          '--api-key', 'local',
          '--alias', 'cosmos',
        ],
        expect.any(Object),
      )
      // No alias => no --alias flag.
      spawnMock.mockClear()
      await ipcHandlers['llama:start']({ sender: win }, 'model-1', {
        modelPath: existingFile,
        serverExecutable: '',
        host: '127.0.0.1',
        port: 8899,
        apiKey: 'local',
        contextSize: 16384,
        batchSize: 256,
        gpuLayers: 99,
        parallelRequests: 1,
        reasoningEffort: 'none',
        alias: '',
      })
      const args: string[] = spawnMock.mock.calls[0][1]
      expect(args).not.toContain('--alias')
    })

    it('expands ~ in modelPath before checking and launching', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const proc = new FakeChildProcess()
      spawnMock.mockReturnValue(proc)
      const win = { webContents: { send: vi.fn() }, isDestroyed: () => false }

      await ipcHandlers['llama:start']({ sender: win }, 'model-1', {
        modelPath: `~/${existingFile.slice(homedir().length + 1)}`,
        serverExecutable: '',
        host: '127.0.0.1',
        port: 8899,
        apiKey: 'local',
        contextSize: 16384,
        batchSize: 256,
        gpuLayers: 99,
        parallelRequests: 1,
        reasoningEffort: 'none',
        alias: '',
      })

      const args: string[] = spawnMock.mock.calls[0][1]
      expect(args[args.indexOf('-m') + 1]).toBe(existingFile)
    })

    it('reports llama:data + llama:exit 1 when the model file is missing', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const win = { webContents: { send: vi.fn() }, isDestroyed: () => false }

      await ipcHandlers['llama:start']({ sender: win }, 'model-1', {
        modelPath: '/definitely/not/here.gguf',
        serverExecutable: '',
        host: '127.0.0.1',
        port: 8899,
        apiKey: 'local',
        contextSize: 16384,
        batchSize: 256,
        gpuLayers: 99,
        parallelRequests: 1,
        reasoningEffort: 'none',
        alias: '',
      })

      const sends = win.webContents.send.mock.calls
      expect(sends[0]).toEqual(['llama:data', 'model-1', expect.stringContaining('model file not found')])
      expect(sends[1]).toEqual(['llama:exit', 'model-1', 1])
      expect(spawnMock).not.toHaveBeenCalled()
    })
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
