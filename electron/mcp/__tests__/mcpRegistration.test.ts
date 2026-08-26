import { describe, it, expect, beforeEach, vi } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))

vi.mock('child_process', () => ({ execFile: execFileMock }))
vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: { handle: vi.fn() },
}))

import { enableTodoMcp, disableTodoMcp, MCP_SERVER_NAME } from '../mcpRegistration'

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

describe('mcpRegistration', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('enableTodoMcp resolves claude via the login shell, then registers the server at user scope', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = []
    mockExecFile((cmd, args) => {
      calls.push({ cmd, args })
      if (args.includes('command -v claude')) return { stdout: '/usr/local/bin/claude\n', stderr: '' }
      return { stdout: '', stderr: '' }
    })

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
    const calls: Array<{ cmd: string; args: string[] }> = []
    mockExecFile((cmd, args) => {
      calls.push({ cmd, args })
      if (args.includes('command -v claude')) return { stdout: '/usr/local/bin/claude\n', stderr: '' }
      return { stdout: '', stderr: '' }
    })

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
})
