import { describe, it, expect, beforeEach, vi } from 'vitest'

const { execFileMock, fsState } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  fsState: { files: new Map<string, string>() },
}))

vi.mock('child_process', () => ({ execFile: execFileMock }))
vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('fs/promises', () => ({
  mkdir: async () => {},
  writeFile: async (path: string, data: string) => {
    fsState.files.set(path, data)
  },
}))

import { ipcMain } from 'electron'
import {
  enableTodoMcp,
  disableTodoMcp,
  enableTodoEnforcerPlugin,
  disableTodoEnforcerPlugin,
  registerTodoMcpHandlers,
  enableBrowserMcp,
  disableBrowserMcp,
  registerBrowserMcpHandlers,
  MCP_SERVER_NAME,
  BROWSER_MCP_SERVER_NAME,
  ENFORCER_PLUGIN_NAME,
  ENFORCER_MARKETPLACE_NAME,
} from '../mcpRegistration'

function mockExecFile(impl: (cmd: string, args: string[]) => { stdout: string; stderr: string }) {
  execFileMock.mockImplementation((cmd: string, args: string[], cb: (...a: any[]) => void) => {
    try {
      const result = impl(cmd, args)
      cb(null, result.stdout, result.stderr)
    } catch (err) {
      cb(err)
    }
  })
}

function mockClaudeResolvable() {
  const calls: Array<{ cmd: string; args: string[] }> = []
  mockExecFile((cmd, args) => {
    calls.push({ cmd, args })
    if (args.includes('command -v claude')) return { stdout: '/usr/local/bin/claude\n', stderr: '' }
    return { stdout: '', stderr: '' }
  })
  return calls
}

describe('mcpRegistration', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    fsState.files.clear()
  })

  it('enableTodoMcp resolves claude via the login shell, then registers the server at user scope', async () => {
    const calls = mockClaudeResolvable()
    await enableTodoMcp()

    expect(calls[0].args).toContain('command -v claude')
    const addCall = calls[1]
    expect(addCall.cmd).toBe('/usr/local/bin/claude')
    expect(addCall.args.slice(0, 3)).toEqual(['mcp', 'add', MCP_SERVER_NAME])
    expect(addCall.args).toContain('--scope')
    expect(addCall.args).toContain('user')
    expect(addCall.args).toContain('-e')
    expect(addCall.args).toContain('VIDE_TODOS_DATA_DIR=/fake/userData')
    expect(addCall.args).toContain('ELECTRON_RUN_AS_NODE=1')
    expect(addCall.args).toContain('--')
    expect(addCall.args.at(-1)).toMatch(/todoMcpServer\.js$/)
  })

  it('enableTodoMcp throws a readable error when claude is not on PATH', async () => {
    mockExecFile(() => ({ stdout: '', stderr: '' }))
    await expect(enableTodoMcp()).rejects.toThrow(/claude/i)
  })

  it('disableTodoMcp removes the server at user scope', async () => {
    const calls = mockClaudeResolvable()
    await disableTodoMcp()
    const removeCall = calls[1]
    expect(removeCall.args).toEqual(['mcp', 'remove', MCP_SERVER_NAME, '--scope', 'user'])
  })

  it('disableTodoMcp never throws, even if the underlying command fails', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (...a: any[]) => void) => {
      cb(new Error('boom'))
    })
    await expect(disableTodoMcp()).resolves.toBeUndefined()
  })

  it('enableTodoEnforcerPlugin writes a marketplace.json listing the plugin by relative source', async () => {
    mockClaudeResolvable()
    await enableTodoEnforcerPlugin()

    const written = [...fsState.files.entries()].find(([path]) => path.endsWith('marketplace.json'))
    expect(written).toBeDefined()
    expect(written![0]).toMatch(/\/vide-marketplace\/\.claude-plugin\/marketplace\.json$/)
    const manifest = JSON.parse(written![1])
    expect(manifest.name).toBe(ENFORCER_MARKETPLACE_NAME)
    expect(manifest.plugins).toEqual([
      expect.objectContaining({ name: ENFORCER_PLUGIN_NAME, source: `./plugins/${ENFORCER_PLUGIN_NAME}` }),
    ])
  })

  it('enableTodoEnforcerPlugin writes a plugin.json with the plugin name and a version', async () => {
    mockClaudeResolvable()
    await enableTodoEnforcerPlugin()

    const written = [...fsState.files.entries()].find(([path]) => path.endsWith('plugin.json'))
    expect(written).toBeDefined()
    expect(written![0]).toMatch(/\/vide-todo-enforcer\/\.claude-plugin\/plugin\.json$/)
    const manifest = JSON.parse(written![1])
    expect(manifest.name).toBe(ENFORCER_PLUGIN_NAME)
    expect(typeof manifest.version).toBe('string')
  })

  it('enableTodoEnforcerPlugin writes a hooks.json Stop entry with the baked-in env var, script path, and data dir', async () => {
    mockClaudeResolvable()
    await enableTodoEnforcerPlugin()

    const written = [...fsState.files.entries()].find(([path]) => path.endsWith('hooks.json'))
    expect(written).toBeDefined()
    expect(written![0]).toMatch(/\/vide-todo-enforcer\/hooks\/hooks\.json$/)
    const hooks = JSON.parse(written![1])
    const command = hooks.hooks.Stop[0].hooks[0].command as string
    expect(hooks.hooks.Stop[0].hooks[0].type).toBe('command')
    expect(command).toContain('ELECTRON_RUN_AS_NODE=1')
    expect(command).toContain('todoEnforcerHookMain.js')
    expect(command).toContain('/fake/userData')
    expect(command).toContain(process.execPath)
  })

  it('enableTodoEnforcerPlugin adds the local marketplace then installs the plugin at user scope', async () => {
    const calls = mockClaudeResolvable()
    await enableTodoEnforcerPlugin()

    const addMarketplace = calls.find((c) => c.args[0] === 'plugin' && c.args[1] === 'marketplace')
    expect(addMarketplace?.args).toEqual(['plugin', 'marketplace', 'add', expect.stringContaining('vide-marketplace')])

    const install = calls.find((c) => c.args[0] === 'plugin' && c.args[1] === 'install')
    expect(install?.args).toEqual([
      'plugin',
      'install',
      `${ENFORCER_PLUGIN_NAME}@${ENFORCER_MARKETPLACE_NAME}`,
      '--scope',
      'user',
    ])
  })

  it('enableTodoEnforcerPlugin still installs even if the marketplace was already added', async () => {
    let addCallCount = 0
    mockExecFile((_cmd, args) => {
      if (args.includes('command -v claude')) return { stdout: '/usr/local/bin/claude\n', stderr: '' }
      if (args[0] === 'plugin' && args[1] === 'marketplace') {
        addCallCount += 1
        throw new Error('marketplace already exists')
      }
      return { stdout: '', stderr: '' }
    })

    await expect(enableTodoEnforcerPlugin()).resolves.toBeUndefined()
    expect(addCallCount).toBe(1)
  })

  it('disableTodoEnforcerPlugin uninstalls the plugin', async () => {
    const calls = mockClaudeResolvable()
    await disableTodoEnforcerPlugin()

    const uninstall = calls.find((c) => c.args[0] === 'plugin' && c.args[1] === 'uninstall')
    expect(uninstall?.args).toEqual(['plugin', 'uninstall', `${ENFORCER_PLUGIN_NAME}@${ENFORCER_MARKETPLACE_NAME}`])
  })

  it('disableTodoEnforcerPlugin never throws, even if the underlying command fails', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (...a: any[]) => void) => {
      cb(new Error('boom'))
    })
    await expect(disableTodoEnforcerPlugin()).resolves.toBeUndefined()
  })

  it('registerTodoMcpHandlers: todos:mcp:enable succeeds even if the enforcer plugin install fails, as long as the MCP registration succeeds', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockExecFile((_cmd, args) => {
      if (args.includes('command -v claude')) return { stdout: '/usr/local/bin/claude\n', stderr: '' }
      if (args[0] === 'plugin') throw new Error('plugin subcommand not supported by this claude version')
      return { stdout: '', stderr: '' } // mcp remove / mcp add succeed
    })

    registerTodoMcpHandlers()
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'todos:mcp:enable')
    expect(call).toBeDefined()
    const handler = call![1] as () => Promise<unknown>

    await expect(handler()).resolves.toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('enableBrowserMcp registers the server at user scope with no data-dir env var (window-scoping is inherited at spawn time, not baked in here)', async () => {
    const calls = mockClaudeResolvable()
    await enableBrowserMcp()

    // calls[0] = resolving `claude` on PATH, calls[1] = the leading `mcp remove`
    // (best-effort, so re-enabling always works even if already registered)
    const addCall = calls[2]
    expect(addCall.args.slice(0, 3)).toEqual(['mcp', 'add', BROWSER_MCP_SERVER_NAME])
    expect(addCall.args).toContain('--scope')
    expect(addCall.args).toContain('user')
    expect(addCall.args).toContain('ELECTRON_RUN_AS_NODE=1')
    expect(addCall.args.filter((a) => a === '-e')).toHaveLength(1)
    expect(addCall.args.at(-1)).toMatch(/browserMcpServer\.js$/)
  })

  it('disableBrowserMcp removes the server at user scope', async () => {
    const calls = mockClaudeResolvable()
    await disableBrowserMcp()
    const removeCall = calls[1]
    expect(removeCall.args).toEqual(['mcp', 'remove', BROWSER_MCP_SERVER_NAME, '--scope', 'user'])
  })

  it('disableBrowserMcp never throws, even if the underlying command fails', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (...a: any[]) => void) => {
      cb(new Error('boom'))
    })
    await expect(disableBrowserMcp()).resolves.toBeUndefined()
  })

  it('registerBrowserMcpHandlers wires browser:mcp:enable and browser:mcp:disable', async () => {
    mockClaudeResolvable()
    registerBrowserMcpHandlers()

    const enableCall = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'browser:mcp:enable')
    const disableCall = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'browser:mcp:disable')
    expect(enableCall).toBeDefined()
    expect(disableCall).toBeDefined()

    await expect((enableCall![1] as () => Promise<unknown>)()).resolves.toBeUndefined()
    await expect((disableCall![1] as () => Promise<unknown>)()).resolves.toBeUndefined()
  })
})
