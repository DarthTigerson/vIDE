import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { handlers, spawnMock, execFileMock } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => sender,
  },
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import {
  buildCommitMessagePrompt,
  postProcessCommitMessage,
  DEFAULT_COMMIT_PROMPT,
  CommitMessageManager,
} from '../commitMessage'
import { _resetClaudePathCacheForTesting } from '../claudePath'

describe('buildCommitMessagePrompt', () => {
  it('uses the default prompt when no custom instruction is given', () => {
    const prompt = buildCommitMessagePrompt('diff --git a/x b/x', '')
    expect(prompt).toContain(DEFAULT_COMMIT_PROMPT)
    expect(prompt).toContain('diff --git a/x b/x')
  })

  it('uses the custom instruction instead of the default when one is given', () => {
    const prompt = buildCommitMessagePrompt('diff --git a/x b/x', 'Always start with an emoji')
    expect(prompt).toContain('Always start with an emoji')
    expect(prompt).not.toContain(DEFAULT_COMMIT_PROMPT)
  })

  it('treats a whitespace-only custom instruction as empty (falls back to default)', () => {
    const prompt = buildCommitMessagePrompt('diff --git a/x b/x', '   \n  ')
    expect(prompt).toContain(DEFAULT_COMMIT_PROMPT)
  })
})

describe('postProcessCommitMessage', () => {
  it('trims surrounding whitespace', () => {
    expect(postProcessCommitMessage('  Fix the thing  \n')).toBe('Fix the thing')
  })

  it('strips a fenced code block the model might wrap the message in', () => {
    expect(postProcessCommitMessage('```\nFix the thing\n```')).toBe('Fix the thing')
  })

  it('strips surrounding quotes', () => {
    expect(postProcessCommitMessage('"Fix the thing"')).toBe('Fix the thing')
  })

  it('returns null for an empty response', () => {
    expect(postProcessCommitMessage('   ')).toBeNull()
  })
})

function fakeProc() {
  const proc: any = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stdin = { end: vi.fn() }
  proc.kill = vi.fn(() => proc.emit('close', 1))
  return proc
}

function fakeWin(id: number) {
  return { id }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CommitMessageManager commitMessage:generate', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    execFileMock.mockReset()
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude', ''))
    _resetClaudePathCacheForTesting()
  })

  function setup() {
    const manager = new CommitMessageManager()
    manager.registerHandlers()
    return { manager, handler: handlers['commitMessage:generate'] }
  }

  it('resolves with the post-processed commit message on success', async () => {
    const { handler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)

    const promise = handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-haiku-4-5-20251001', '')
    await flushMicrotasks()
    proc.stdout.emit('data', Buffer.from('Fix the login bug'))
    proc.emit('close', 0)

    expect(await promise).toBe('Fix the login bug')
  })

  it('spawns the resolved claude path directly (no shell) with the model and prompt', async () => {
    const { handler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)

    const promise = handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-opus-5', '')
    await flushMicrotasks()
    proc.emit('close', 0)
    await promise

    const [command, args, options] = spawnMock.mock.calls[0]
    expect(command).toBe('/usr/local/bin/claude')
    expect(args).toContain('-p')
    expect(args[args.indexOf('--model') + 1]).toBe('claude-opus-5')
    expect(args[args.indexOf('--output-format') + 1]).toBe('text')
    expect(args).toContain('--no-session-persistence')
    expect(options.shell).toBeFalsy()
    expect(args).not.toContain('--bare')
  })

  it('resolves null on non-zero exit', async () => {
    const { handler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)

    const promise = handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-haiku-4-5-20251001', '')
    await flushMicrotasks()
    proc.emit('close', 1)

    expect(await promise).toBeNull()
  })

  it('resolves null when the process errors', async () => {
    const { handler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)

    const promise = handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-haiku-4-5-20251001', '')
    await flushMicrotasks()
    proc.emit('error', new Error('spawn failed'))

    expect(await promise).toBeNull()
  })

  it('resolves null (not rejects) when spawn() throws synchronously', async () => {
    const { handler } = setup()
    spawnMock.mockImplementationOnce(() => {
      throw new Error('spawn EINVAL, argv contains a null byte')
    })

    await expect(
      handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-haiku-4-5-20251001', '')
    ).resolves.toBeNull()
  })

  it('resolves null without spawning when claude cannot be resolved on PATH', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(new Error('not found'), '', ''))
    const { handler } = setup()

    expect(await handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-haiku-4-5-20251001', '')).toBeNull()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('resolves null without spawning when the diff is empty (nothing staged)', async () => {
    const { handler } = setup()

    expect(await handler({ sender: fakeWin(1) }, '', 'claude-haiku-4-5-20251001', '')).toBeNull()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('passes the custom prompt through to the built prompt when one is provided', async () => {
    const { handler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)

    const promise = handler({ sender: fakeWin(1) }, 'diff --git a/x b/x', 'claude-haiku-4-5-20251001', 'Always mention the ticket number')
    await flushMicrotasks()
    proc.emit('close', 0)
    await promise

    const args = spawnMock.mock.calls[0][1]
    const prompt = args[args.indexOf('-p') + 1]
    expect(prompt).toContain('Always mention the ticket number')
  })

  it('kills the previous in-flight request for the same window when a new one arrives', async () => {
    const { handler } = setup()
    const procA = fakeProc()
    const procB = fakeProc()
    spawnMock.mockReturnValueOnce(procA).mockReturnValueOnce(procB)

    const promiseA = handler({ sender: fakeWin(1) }, 'diff a', 'claude-haiku-4-5-20251001', '')
    await flushMicrotasks()
    handler({ sender: fakeWin(1) }, 'diff b', 'claude-haiku-4-5-20251001', '')

    expect(procA.kill).toHaveBeenCalled()
    expect(await promiseA).toBeNull()
  })
})
