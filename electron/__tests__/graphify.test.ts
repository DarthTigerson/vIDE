// electron/__tests__/graphify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { ipcHandlers, spawnMock, execFileMock, readFileMock, existsSyncMock } = vi.hoisted(() => ({
  ipcHandlers: {} as Record<string, (...args: any[]) => unknown>,
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
  readFileMock: vi.fn(),
  existsSyncMock: vi.fn(),
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

vi.mock('fs/promises', () => ({
  readFile: (...a: unknown[]) => readFileMock(...a),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: (...a: unknown[]) => existsSyncMock(...a) }
})

import { GraphifyManager, resolveGraphifyPath, _resetGraphifyPathCacheForTesting } from '../graphify'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

function fakeWin(id: number) {
  return { id, isDestroyed: () => false, webContents: { send: vi.fn() } }
}

// Escapes past the microtask chain created by resolveGraphifyPath's
// `new Promise` + `.finally()` wrapping, so tests that grab a pending
// promise without awaiting it (to fire process events afterward) see the
// path-resolution await inside checkAvailable()/run() actually settle first.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('GraphifyManager', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    execFileMock.mockReset()
    readFileMock.mockReset()
    existsSyncMock.mockReset()
    _resetGraphifyPathCacheForTesting()
    // Default: login-shell resolution fails, so callers fall back to the
    // bare 'graphify' command name — matches this suite's original
    // expectations for spawnMock's first argument.
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(new Error('not found'), '')
    })
    // Default: project directory exists, but no ~/.local/bin/graphify
    // (that fallback would replace the bare command name).
    existsSyncMock.mockImplementation((p: string) => !String(p).endsWith('/.local/bin/graphify'))
  })

  it('claudeSkillInstalled checks for the project skill file', () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()

    existsSyncMock.mockReturnValue(true)
    expect(ipcHandlers['graphify:claudeSkillInstalled']({}, '/proj')).toBe(true)
    expect(existsSyncMock).toHaveBeenLastCalledWith('/proj/.claude/skills/graphify/SKILL.md')

    existsSyncMock.mockReturnValue(false)
    expect(ipcHandlers['graphify:claudeSkillInstalled']({}, '/proj')).toBe(false)
  })

  it('isAvailable resolves true when the process spawns successfully', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const promise = ipcHandlers['graphify:isAvailable']({})
    await flushMicrotasks()
    proc.emit('spawn')
    await expect(promise).resolves.toBe(true)
    expect(spawnMock).toHaveBeenCalledWith('graphify', ['--help'], expect.any(Object))
  })

  it('isAvailable resolves false when the binary is missing (ENOENT)', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const promise = ipcHandlers['graphify:isAvailable']({})
    await flushMicrotasks()
    proc.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
    await expect(promise).resolves.toBe(false)
  })

  it('isAvailable spawns the resolved absolute path when login-shell resolution succeeds', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/opt/homebrew/bin/graphify\n')
    })
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    const promise = ipcHandlers['graphify:isAvailable']({})
    await flushMicrotasks()
    proc.emit('spawn')
    await expect(promise).resolves.toBe(true)
    expect(spawnMock).toHaveBeenCalledWith('/opt/homebrew/bin/graphify', ['--help'], expect.any(Object))
  })

  it('run spawns "graphify update <cwd>" and streams stdout as graphify:data', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const win = fakeWin(1)
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    await ipcHandlers['graphify:run']({ sender: win }, 'run-1', '/project')
    proc.stdout.emit('data', Buffer.from('working...'))

    expect(spawnMock).toHaveBeenCalledWith(
      'graphify',
      ['update', '/project'],
      expect.objectContaining({ cwd: '/project' })
    )
    expect(win.webContents.send).toHaveBeenCalledWith('graphify:data', 'run-1', 'working...')
  })

  it('run spawns the resolved absolute graphify path when login-shell resolution succeeds', async () => {
    execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
      cb(null, '/opt/homebrew/bin/graphify\n')
    })
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const win = fakeWin(1)
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    await ipcHandlers['graphify:run']({ sender: win }, 'run-1', '/project')

    expect(spawnMock).toHaveBeenCalledWith(
      '/opt/homebrew/bin/graphify',
      ['update', '/project'],
      expect.objectContaining({ cwd: '/project' })
    )
  })

  it('run sends graphify:exit with the process exit code', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const win = fakeWin(1)
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    await ipcHandlers['graphify:run']({ sender: win }, 'run-1', '/project')
    proc.emit('close', 0)

    expect(win.webContents.send).toHaveBeenCalledWith('graphify:exit', 'run-1', 0)
  })

  it('run reports install instructions through graphify:data when the CLI is not installed', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const win = fakeWin(1)
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    await ipcHandlers['graphify:run']({ sender: win }, 'run-1', '/project')
    proc.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))

    expect(win.webContents.send).toHaveBeenCalledWith(
      'graphify:data',
      'run-1',
      expect.stringContaining('Settings > Graphify')
    )
    expect(win.webContents.send).toHaveBeenCalledWith('graphify:exit', 'run-1', 1)
  })

  it('run reports a distinct error when cwd does not exist, without spawning or blaming a missing binary', async () => {
    existsSyncMock.mockReturnValue(false)
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const win = fakeWin(1)

    await ipcHandlers['graphify:run']({ sender: win }, 'run-1', '/deleted-project')

    expect(spawnMock).not.toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith(
      'graphify:data',
      'run-1',
      expect.stringContaining('/deleted-project')
    )
    expect(win.webContents.send).not.toHaveBeenCalledWith(
      'graphify:data',
      'run-1',
      expect.stringContaining('Settings > Graphify')
    )
    expect(win.webContents.send).toHaveBeenCalledWith('graphify:exit', 'run-1', 1)
  })

  it('a second run in the same window while one is in flight is rejected without spawning', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    const win = fakeWin(1)
    const proc = new FakeChildProcess()
    spawnMock.mockReturnValue(proc)

    await ipcHandlers['graphify:run']({ sender: win }, 'run-1', '/project')
    await ipcHandlers['graphify:run']({ sender: win }, 'run-2', '/project')

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith(
      'graphify:data',
      'run-2',
      expect.stringContaining('already running')
    )
  })

  it('readGraph parses graphify-out/graph.json relative to cwd', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    readFileMock.mockResolvedValue(JSON.stringify({ directed: false, multigraph: false, nodes: [], links: [], hyperedges: [] }))

    const result = await ipcHandlers['graphify:readGraph']({}, '/project')

    expect(readFileMock).toHaveBeenCalledWith('/project/graphify-out/graph.json', 'utf-8')
    expect(result).toEqual({ directed: false, multigraph: false, nodes: [], links: [], hyperedges: [] })
  })

  it('readGraph rejects when the parsed JSON has the wrong shape (nodes/links not arrays)', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    readFileMock.mockResolvedValue(JSON.stringify({ foo: 'bar' }))

    await expect(ipcHandlers['graphify:readGraph']({}, '/project')).rejects.toThrow()
  })

  it('readGraph rejects when nodes/links are present but not arrays', async () => {
    const manager = new GraphifyManager()
    manager.registerHandlers()
    readFileMock.mockResolvedValue(JSON.stringify({ nodes: {}, links: {} }))

    await expect(ipcHandlers['graphify:readGraph']({}, '/project')).rejects.toThrow()
  })

  describe('installClaudeSkill', () => {
    // A single execFileMock backs both the login-shell path resolution
    // (3-arg call: shell, ['-lic', ...], cb) and the actual install command
    // (4-arg call: bin, ['install', ...], options, cb) — dispatch on shape.
    function stubExecFile(installResult: { err?: Error; stdout?: string; stderr?: string }) {
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error | null, stdout?: string, stderr?: string) => void
        const cmdArgs = args[1] as string[]
        if (cmdArgs[0] === '-lic') {
          cb(new Error('not found'), '')
        } else {
          cb(installResult.err ?? null, installResult.stdout ?? '', installResult.stderr ?? '')
        }
      })
    }

    it('runs "graphify install --platform claude --project" in cwd and resolves ok on success', async () => {
      stubExecFile({ stdout: 'skill installed  ->  .claude/skills/graphify/SKILL.md\n' })
      const manager = new GraphifyManager()
      manager.registerHandlers()

      const result = await ipcHandlers['graphify:installClaudeSkill']({}, '/project')

      expect(execFileMock).toHaveBeenCalledWith(
        'graphify',
        ['install', '--platform', 'claude', '--project'],
        { cwd: '/project' },
        expect.any(Function)
      )
      expect(result).toEqual({ ok: true, output: 'skill installed  ->  .claude/skills/graphify/SKILL.md' })
    })

    it('repairHooksIfNeeded re-runs the install without staging when a hook path is dead', async () => {
      stubExecFile({ stdout: 'skill installed' })
      const installStub = execFileMock.getMockImplementation()!
      // `git ls-files -- graphify-out` prints nothing: built locally, not from the repo.
      execFileMock.mockImplementation((...args: unknown[]) => {
        if (args[0] === 'git' && (args[1] as string[])[0] === 'ls-files') {
          (args[args.length - 1] as (err: Error | null, stdout: string) => void)(null, '')
          return
        }
        installStub(...args)
      })
      existsSyncMock.mockImplementation((p: string) => p !== '/gone/graphify' && !String(p).endsWith('/.local/bin/graphify'))
      readFileMock.mockResolvedValue(JSON.stringify({
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/gone/graphify hook-guard search' }] }] },
      }))
      const manager = new GraphifyManager()
      manager.registerHandlers()

      const result = await ipcHandlers['graphify:repairHooksIfNeeded']({}, '/project')

      expect(result).toEqual({ repaired: true, ok: true, output: 'skill installed' })
      expect(execFileMock).toHaveBeenCalledWith('graphify', ['install', '--platform', 'claude', '--project'], { cwd: '/project' }, expect.any(Function))
      expect(execFileMock).not.toHaveBeenCalledWith('git', expect.arrayContaining(['add']), expect.anything(), expect.anything())
    })

    it('repairHooksIfNeeded does nothing when no hook path is dead', async () => {
      stubExecFile({ stdout: 'skill installed' })
      readFileMock.mockResolvedValue(JSON.stringify({
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'graphify hook-guard search' }] }] },
      }))
      const manager = new GraphifyManager()
      manager.registerHandlers()

      const result = await ipcHandlers['graphify:repairHooksIfNeeded']({}, '/project')

      expect(result).toEqual({ repaired: false, ok: true, output: '' })
      expect(execFileMock).not.toHaveBeenCalledWith('graphify', expect.anything(), expect.anything(), expect.anything())
    })

    it('stages .claude/skills/graphify and .claude/CLAUDE.md via git add after a successful install', async () => {
      stubExecFile({ stdout: 'skill installed' })
      const manager = new GraphifyManager()
      manager.registerHandlers()

      await ipcHandlers['graphify:installClaudeSkill']({}, '/project')

      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        ['add', '.claude/skills/graphify', '.claude/CLAUDE.md'],
        { cwd: '/project' },
        expect.any(Function)
      )
    })

    it('does not run git add when the install succeeds but neither expected path exists', async () => {
      stubExecFile({ stdout: 'skill installed' })
      existsSyncMock.mockImplementation((p: string) => p === '/project')
      const manager = new GraphifyManager()
      manager.registerHandlers()

      await ipcHandlers['graphify:installClaudeSkill']({}, '/project')

      expect(execFileMock).not.toHaveBeenCalledWith('git', expect.anything(), expect.anything(), expect.anything())
    })

    it('does not run git add when the install command fails', async () => {
      stubExecFile({ err: new Error('exit code 1'), stderr: 'error: not a git repository' })
      const manager = new GraphifyManager()
      manager.registerHandlers()

      await ipcHandlers['graphify:installClaudeSkill']({}, '/project')

      expect(execFileMock).not.toHaveBeenCalledWith('git', expect.anything(), expect.anything(), expect.anything())
    })

    it('resolves ok:false with the captured output when the install command fails', async () => {
      stubExecFile({ err: new Error('exit code 1'), stderr: 'error: not a git repository' })
      const manager = new GraphifyManager()
      manager.registerHandlers()

      const result = await ipcHandlers['graphify:installClaudeSkill']({}, '/project')

      expect(result).toEqual({ ok: false, output: 'error: not a git repository' })
    })

    it('resolves ok:false without spawning when cwd does not exist', async () => {
      existsSyncMock.mockReturnValue(false)
      const manager = new GraphifyManager()
      manager.registerHandlers()
      // registerHandlers() itself prewarms resolveGraphifyPath() via execFile —
      // clear that call so this assertion is scoped to the handler under test.
      execFileMock.mockClear()

      const result = await ipcHandlers['graphify:installClaudeSkill']({}, '/deleted-project') as { ok: boolean; output: string }

      expect(result.ok).toBe(false)
      expect(result.output).toContain('/deleted-project')
      expect(execFileMock).not.toHaveBeenCalled()
    })
  })

  describe('resolveGraphifyPath', () => {
    it('caches a successful resolution across calls (only resolves via the login shell once)', async () => {
      execFileMock.mockImplementation((_shell: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
        cb(null, '/usr/local/bin/graphify\n')
      })

      const first = await resolveGraphifyPath()
      const second = await resolveGraphifyPath()

      expect(first).toBe('/usr/local/bin/graphify')
      expect(second).toBe('/usr/local/bin/graphify')
      expect(execFileMock).toHaveBeenCalledTimes(1)
    })

    it('resolves null when the login shell cannot find graphify', async () => {
      const resolved = await resolveGraphifyPath()
      expect(resolved).toBeNull()
    })
  })
})

describe("GraphifyManager install (Settings > Graphify button)", () => {
  function installer(uv: string | null) {
    return {
      findUv: vi.fn(async () => uv),
      downloadUv: vi.fn(async (opts?: { onProgress?: (r: number, t: number) => void }) => {
        opts?.onProgress?.(20, 20)
        return '/data/graphify/uv/0.11.1/uv'
      }),
      installGraphify: vi.fn(async () => ({ ok: true, output: 'Installed 2 executables: graphify, graphify-mcp' })),
      toolBinDir: vi.fn(async () => '/Users/t/.local/bin'),
    }
  }
  const event = () => ({ sender: { send: vi.fn(), isDestroyed: () => false } })

  beforeEach(() => {
    _resetGraphifyPathCacheForTesting()
    execFileMock.mockReset().mockImplementation((_s: string, _a: string[], cb: (err: Error | null, out: string) => void) => cb(Object.assign(new Error('nf'), { code: 1 }), ''))
    existsSyncMock.mockReset().mockReturnValue(false)
  })

  it('reports nothing installed', async () => {
    new GraphifyManager(installer('/usr/bin/uv')).registerHandlers()
    await expect(ipcHandlers['graphify:getInstall']({})).resolves.toEqual({ path: null, source: null, downloadBytes: null })
  })

  it('installs with the uv already on the machine', async () => {
    const i = installer('/opt/homebrew/bin/uv')
    new GraphifyManager(i).registerHandlers()
    const result = await ipcHandlers['graphify:install'](event())
    expect(i.downloadUv).not.toHaveBeenCalled()
    expect(i.installGraphify).toHaveBeenCalledWith('/opt/homebrew/bin/uv')
    expect(result).toEqual({ ok: true, path: '/Users/t/.local/bin/graphify' })
    // Found from now on even when that folder isn't on the login shell's PATH.
    await expect(resolveGraphifyPath()).resolves.toBe('/Users/t/.local/bin/graphify')
  })

  it("downloads vIDE's own uv first when there is none, streaming progress", async () => {
    const i = installer(null)
    new GraphifyManager(i).registerHandlers()
    const e = event()
    await ipcHandlers['graphify:install'](e)
    expect(e.sender.send).toHaveBeenCalledWith('graphify:installProgress', 20, 20)
    expect(i.installGraphify).toHaveBeenCalledWith('/data/graphify/uv/0.11.1/uv')
  })

  it('runs one install when asked twice', async () => {
    const i = installer('/usr/bin/uv')
    new GraphifyManager(i).registerHandlers()
    await Promise.all([ipcHandlers['graphify:install'](event()), ipcHandlers['graphify:install'](event())])
    expect(i.installGraphify).toHaveBeenCalledTimes(1)
  })

  it("returns uv's output as the error when the install fails", async () => {
    const i = installer('/usr/bin/uv')
    i.installGraphify.mockResolvedValueOnce({ ok: false, output: 'error: Failed to fetch graphifyy\n' })
    new GraphifyManager(i).registerHandlers()
    await expect(ipcHandlers['graphify:install'](event())).resolves.toEqual({ ok: false, error: 'error: Failed to fetch graphifyy' })
  })

  it("finds a uv-installed graphify in ~/.local/bin when the login shell can't", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('/.local/bin/graphify'))
    await expect(resolveGraphifyPath()).resolves.toMatch(/\/\.local\/bin\/graphify$/)
  })
})
