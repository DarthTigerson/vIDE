// electron/__tests__/llama.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { ipcHandlers, spawnMock, execFileMock, windows } = vi.hoisted(() => ({
  windows: [] as any[],
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
    getAllWindows: () => windows,
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
import { appendCapped } from '../llamaLog'
import { LlamaManager, resolveLlamaPath, _resetLlamaPathCacheForTesting, sumLlamaServerRss, buildLlamaServerArgs, AUTO_OPTIMIZE_ARGS } from '../llama'

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
    windows.length = 0
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

  describe("vIDE's own llama.cpp (Settings > Llama install button)", () => {
    function bundled(installed: string | null) {
      let path = installed
      return {
        dir: '/data/autocomplete/llama.cpp',
        find: vi.fn(async () => path),
        install: vi.fn(async (_dir: string, opts?: { onProgress?: (r: number, t: number) => void }) => {
          opts?.onProgress?.(6, 12)
          opts?.onProgress?.(12, 12)
          path = '/data/autocomplete/llama.cpp/b11707/llama-b11707/llama-server'
          return path
        }),
      }
    }

    it('reports a llama.cpp found on PATH as the system install', async () => {
      execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
        cb(null, '/opt/homebrew/bin/llama-server\n')
      })
      new LlamaManager(() => [], bundled(null)).registerHandlers()
      await expect(ipcHandlers['llama:getInstall']({})).resolves.toMatchObject({ path: '/opt/homebrew/bin/llama-server', source: 'system' })
    })

    it("reports vIDE's own copy when there is none on PATH", async () => {
      new LlamaManager(() => [], bundled('/data/x/llama-server')).registerHandlers()
      await expect(ipcHandlers['llama:getInstall']({})).resolves.toMatchObject({ path: '/data/x/llama-server', source: 'vide' })
    })

    it('reports nothing installed, with the download size', async () => {
      new LlamaManager(() => [], bundled(null)).registerHandlers()
      const info = await ipcHandlers['llama:getInstall']({}) as { path: string | null; source: string | null; downloadBytes: number | null }
      expect(info.path).toBeNull()
      expect(info.source).toBeNull()
      expect(info.downloadBytes).toBeGreaterThan(0)
    })

    it('installs into the shared folder, streaming progress to the window that asked', async () => {
      const b = bundled(null)
      new LlamaManager(() => [], b).registerHandlers()
      const send = vi.fn()
      const result = await ipcHandlers['llama:install']({ sender: { send, isDestroyed: () => false } })
      expect(b.install).toHaveBeenCalledWith('/data/autocomplete/llama.cpp', expect.any(Object))
      expect(send).toHaveBeenCalledWith('llama:installProgress', 12, 12)
      expect(result).toEqual({ ok: true, path: '/data/autocomplete/llama.cpp/b11707/llama-b11707/llama-server' })
    })

    it('runs one install when asked twice', async () => {
      const b = bundled(null)
      new LlamaManager(() => [], b).registerHandlers()
      const event = { sender: { send: vi.fn(), isDestroyed: () => false } }
      await Promise.all([ipcHandlers['llama:install'](event), ipcHandlers['llama:install'](event)])
      expect(b.install).toHaveBeenCalledTimes(1)
    })

    it('returns the error instead of throwing when the install fails', async () => {
      const b = bundled(null)
      b.install.mockRejectedValueOnce(new Error('Download failed: HTTP 404'))
      new LlamaManager(() => [], b).registerHandlers()
      await expect(ipcHandlers['llama:install']({ sender: { send: vi.fn(), isDestroyed: () => false } }))
        .resolves.toEqual({ ok: false, error: 'Download failed: HTTP 404' })
    })

    it("isAvailable runs vIDE's copy when there is none on PATH", async () => {
      new LlamaManager(() => [], bundled('/data/x/llama-server')).registerHandlers()
      const proc = new FakeChildProcess()
      spawnMock.mockReturnValue(proc)
      const promise = ipcHandlers['llama:isAvailable']({})
      await flushMicrotasks()
      proc.emit('spawn')
      await expect(promise).resolves.toBe(true)
      expect(spawnMock).toHaveBeenCalledWith('/data/x/llama-server', ['--help'], expect.any(Object))
    })
  })

  describe('llama:start', () => {
    const existingFile = __filename // a path that existsSync() will accept

    it('spawns llama-server with the config translated into launch args', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const proc = new FakeChildProcess()
      spawnMock.mockReturnValue(proc)
      const win = { webContents: { send: vi.fn() }, isDestroyed: () => false }
      windows.push(win)

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
      windows.push(win)

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

    it('sends output to every window and keeps it for llama:getLog', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const proc = new FakeChildProcess()
      spawnMock.mockReturnValue(proc)
      const starter = { webContents: { send: vi.fn() }, isDestroyed: () => false }
      const other = { webContents: { send: vi.fn() }, isDestroyed: () => false }
      windows.push(starter, other)

      expect(await ipcHandlers['llama:getLog']({}, 'model-1')).toBeNull()
      await ipcHandlers['llama:start']({ sender: starter }, 'model-1', {
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
      proc.stderr.emit('data', Buffer.from('loading model\n'))
      proc.stdout.emit('data', Buffer.from('server is listening\n'))

      expect(other.webContents.send).toHaveBeenCalledWith('llama:data', 'model-1', 'loading model\n')
      expect(await ipcHandlers['llama:getLog']({}, 'model-1')).toEqual({
        running: true,
        output: 'loading model\nserver is listening\n',
      })

      proc.emit('close', 0)
      expect(other.webContents.send).toHaveBeenCalledWith('llama:exit', 'model-1', 0)
      expect(await ipcHandlers['llama:getLog']({}, 'model-1')).toEqual({
        running: false,
        output: 'loading model\nserver is listening\n',
      })
    })

    it('starts a fresh log on relaunch', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const first = new FakeChildProcess()
      const second = new FakeChildProcess()
      spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)

      await ipcHandlers['llama:start']({}, 'model-1', {
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
      first.stdout.emit('data', Buffer.from('old run\n'))
      await ipcHandlers['llama:start']({}, 'model-1', {
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

      expect(first.kill).toHaveBeenCalled()
      expect(await ipcHandlers['llama:getLog']({}, 'model-1')).toEqual({ running: true, output: '' })
    })

    it('reports llama:data + llama:exit 1 when the model file is missing', async () => {
      const manager = new LlamaManager()
      manager.registerHandlers()
      const win = { webContents: { send: vi.fn() }, isDestroyed: () => false }
      windows.push(win)

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

    describe('when llama.cpp is simply not installed', () => {
      // `command -v a || command -v b` exits 1 when neither exists — the normal
      // "not installed" answer, not a failure worth an error log (VIDE-110).
      function notInstalled() {
        execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
          cb(Object.assign(new Error('Command failed'), { code: 1 }), '')
        })
      }

      it('resolves null without logging an error', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        notInstalled()
        expect(await resolveLlamaPath()).toBeNull()
        expect(errorSpy).not.toHaveBeenCalled()
        errorSpy.mockRestore()
      })

      it('stays quiet even when the login shell printed a banner before exiting 1', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
          cb(Object.assign(new Error('Command failed'), { code: 1 }), 'Welcome back!\nnvm loaded\n')
        })
        expect(await resolveLlamaPath()).toBeNull()
        expect(errorSpy).not.toHaveBeenCalled()
        errorSpy.mockRestore()
      })

      it('is still re-checked next time (a later install must be picked up), not cached', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        notInstalled()
        await resolveLlamaPath()
        await resolveLlamaPath()
        expect(execFileMock).toHaveBeenCalledTimes(2)
        vi.mocked(console.error).mockRestore()
      })
    })

    describe('when resolving fails for a real reason', () => {
      it('still logs a failure to launch the login shell', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
          cb(Object.assign(new Error('spawn /bin/zsh ENOENT'), { code: 'ENOENT' }), '')
        })
        expect(await resolveLlamaPath()).toBeNull()
        expect(errorSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
      })

      it('still logs an unexpected exit code from the login shell', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
          cb(Object.assign(new Error('Command failed'), { code: 127 }), '')
        })
        expect(await resolveLlamaPath()).toBeNull()
        expect(errorSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
      })

      it('still logs when the shell succeeds but prints something that is not a path', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
          cb(null, 'not a path\n')
        })
        expect(await resolveLlamaPath()).toBeNull()
        expect(errorSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
      })
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

describe('buildLlamaServerArgs', () => {
  const base = {
    modelPath: '/m.gguf', serverExecutable: '', host: '127.0.0.1', port: 8899, apiKey: 'local',
    contextSize: 131072, batchSize: 256, gpuLayers: 99, parallelRequests: 1, reasoningEffort: 'medium' as const, alias: '',
  }

  it('auto-optimize leaves context and GPU layers to llama.cpp --fit and adds the memory-saving flags', () => {
    const args = buildLlamaServerArgs({ ...base, autoOptimize: true })
    expect(args).not.toContain('-c')
    expect(args).not.toContain('-ngl')
    expect(args).toEqual(expect.arrayContaining(AUTO_OPTIMIZE_ARGS))
    expect(args.join(' ')).toContain('--cache-type-k q8_0 --cache-type-v q8_0 --cache-ram 2048')
  })

  it('without auto-optimize passes the configured context and GPU layers', () => {
    const args = buildLlamaServerArgs(base)
    expect(args.join(' ')).toContain('-c 131072 --batch-size 256 -ngl 99')
    expect(args).not.toContain('--fit')
  })
})

describe('sumLlamaServerRss', () => {
  const ps = [
    '  101 204800 /opt/homebrew/bin/llama-server',
    '  202 1048576 /Users/x/Library/Application Support/vIDE/autocomplete/llama.cpp/b11707/llama-b11707/llama-server',
    '  303 5000 /usr/bin/zsh',
  ].join('\n')

  it('adds up every llama-server process', () => {
    expect(sumLlamaServerRss(ps, [])).toBe((204800 + 1048576) * 1024)
  })

  it("leaves out vIDE's autocomplete server, which has its own RAM row", () => {
    expect(sumLlamaServerRss(ps, [202])).toBe(204800 * 1024)
  })

  it('returns null when no llama-server is left', () => {
    expect(sumLlamaServerRss(ps, [101, 202])).toBeNull()
  })
})

describe('appendCapped', () => {
  it('keeps only the newest characters past the cap', () => {
    expect(appendCapped('abc', 'def', 4)).toBe('cdef')
    expect(appendCapped('ab', 'c', 4)).toBe('abc')
  })
})
