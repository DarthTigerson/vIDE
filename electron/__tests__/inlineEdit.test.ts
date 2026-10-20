import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

const { handlers, spawnMock, execFileMock } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => sender,
  },
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import { buildEditSystemPrompt, buildEditPrompt, parseStreamJsonLine, InlineEditManager } from '../inlineEdit'
import { _resetClaudePathCacheForTesting } from '../claudePath'

describe('buildEditSystemPrompt', () => {
  it('instructs the model to respond with only the replacement code', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('ONLY')
    expect(prompt).toContain('no markdown code fences')
  })
})

describe('buildEditPrompt', () => {
  it('wraps prefix, selection, suffix, language, and the instruction', () => {
    const prompt = buildEditPrompt('const x = 1\n', 'const y = 2\n', 'foo()', 'add a comment', 'typescript')
    expect(prompt).toBe(
      'Language: typescript\n<prefix>\nconst x = 1\n\n</prefix>\n<selection>\nfoo()\n</selection>\n<suffix>\nconst y = 2\n\n</suffix>\n\nInstruction: add a comment'
    )
  })

  it('handles an empty selection (insert mode)', () => {
    const prompt = buildEditPrompt('const x = 1\n', '', '', 'add a log line', 'typescript')
    expect(prompt).toBe(
      'Language: typescript\n<prefix>\nconst x = 1\n\n</prefix>\n<selection>\n\n</selection>\n<suffix>\n\n</suffix>\n\nInstruction: add a log line'
    )
  })
})

describe('parseStreamJsonLine', () => {
  it('extracts a text delta from a content_block_delta event', () => {
    const line = '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hello world"}},"session_id":"abc"}'
    expect(parseStreamJsonLine(line)).toEqual({ type: 'delta', text: 'hello world' })
  })

  it('ignores a thinking_delta event', () => {
    const line = '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"reasoning..."}},"session_id":"abc"}'
    expect(parseStreamJsonLine(line)).toBeNull()
  })

  it('ignores a signature_delta event', () => {
    const line = '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"abc123"}},"session_id":"abc"}'
    expect(parseStreamJsonLine(line)).toBeNull()
  })

  it('reports a successful result line', () => {
    const line = '{"is_error":false,"result":"hello world","type":"result","subtype":"success"}'
    expect(parseStreamJsonLine(line)).toEqual({ type: 'result', isError: false })
  })

  it('reports a failed result line', () => {
    const line = '{"is_error":true,"result":"","type":"result","subtype":"error"}'
    expect(parseStreamJsonLine(line)).toEqual({ type: 'result', isError: true })
  })

  it('ignores an unrelated system event', () => {
    const line = '{"type":"system","subtype":"init","session_id":"abc"}'
    expect(parseStreamJsonLine(line)).toBeNull()
  })

  it('ignores a content_block_start event', () => {
    const line = '{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}}'
    expect(parseStreamJsonLine(line)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseStreamJsonLine('not json')).toBeNull()
  })

  it('returns null for an empty line', () => {
    expect(parseStreamJsonLine('')).toBeNull()
  })
})

function fakeProc() {
  const proc: any = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stdout.setEncoding = vi.fn()
  proc.stderr = new EventEmitter()
  proc.stderr.resume = vi.fn()
  proc.kill = vi.fn(() => proc.emit('close', null))
  return proc
}

function fakeWin(id: number) {
  return { id, isDestroyed: () => false, webContents: { send: vi.fn() } }
}

// A macrotask tick reliably drains however many microtask hops sit between
// calling the fire-and-forget handler and it reaching the synchronous
// spawn() call (the exact count depends on the await inside
// resolveClaudePath()), without the test needing to know that number.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

const BASE_PAYLOAD = {
  requestId: 'req-1',
  prefix: 'const x = 1\n',
  suffix: '',
  selection: 'foo()',
  instruction: 'add a comment',
  language: 'typescript',
  model: 'claude-sonnet-5',
}

describe('InlineEditManager', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    execFileMock.mockReset()
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude', ''))
    _resetClaudePathCacheForTesting()
  })

  function setup() {
    const manager = new InlineEditManager()
    manager.registerHandlers()
    return { manager, startHandler: handlers['inlineEdit:start'], cancelHandler: handlers['inlineEdit:cancel'] }
  }

  it('spawns claude with streaming flags, no shell, and no --bare', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()

    const [command, args, options] = spawnMock.mock.calls[0]
    expect(command).toBe('/usr/local/bin/claude')
    expect(args).toContain('-p')
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(args).toContain('--include-partial-messages')
    expect(args).toContain('--verbose')
    expect(args).not.toContain('--bare')
    expect(options.shell).toBeFalsy()
  })

  it('forwards text deltas as they stream in, tagged with the request id', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()

    proc.stdout.emit('data', Buffer.from('{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hello"}}}\n'))

    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'delta', requestId: 'req-1', text: 'hello' })
  })

  it('buffers a line split across multiple stdout chunks', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()

    const line = '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"split"}}}\n'
    proc.stdout.emit('data', Buffer.from(line.slice(0, 20)))
    proc.stdout.emit('data', Buffer.from(line.slice(20)))

    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'delta', requestId: 'req-1', text: 'split' })
  })

  it('sends done when the process closes cleanly with no error result', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()
    proc.emit('close', 0)

    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'done', requestId: 'req-1' })
  })

  it('sends an error when the process exits non-zero', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()
    proc.emit('close', 1)

    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'error', requestId: 'req-1', message: 'Something went wrong' })
  })

  it('sends an error when a result line reports is_error even on a zero exit code', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()
    proc.stdout.emit('data', Buffer.from('{"type":"result","is_error":true,"result":""}\n'))
    proc.emit('close', 0)

    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'error', requestId: 'req-1', message: 'Something went wrong' })
  })

  it('sends an error when the process itself errors', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()
    proc.emit('error', new Error('spawn failed'))

    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'error', requestId: 'req-1', message: 'Failed to start claude' })
  })

  it('sends a single error and does not spawn when claude cannot be resolved', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(new Error('not found'), '', ''))
    const { startHandler } = setup()
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()

    expect(spawnMock).not.toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'error', requestId: 'req-1', message: 'claude CLI not found' })
  })

  it('kills the previous in-flight request for the same window and sends no events for it once a new one arrives', async () => {
    const { startHandler } = setup()
    const procA = fakeProc()
    const procB = fakeProc()
    spawnMock.mockReturnValueOnce(procA).mockReturnValueOnce(procB)
    const win = fakeWin(1)

    startHandler({ sender: win }, { ...BASE_PAYLOAD, requestId: 'req-a' })
    await flushMicrotasks()
    startHandler({ sender: win }, { ...BASE_PAYLOAD, requestId: 'req-b' })
    await flushMicrotasks()

    expect(procA.kill).toHaveBeenCalled()
    win.webContents.send.mockClear()
    procA.emit('close', 0)
    expect(win.webContents.send).not.toHaveBeenCalled()

    procB.emit('close', 0)
    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'done', requestId: 'req-b' })
  })

  it('supersedes a request still resolving the claude path when a second one arrives before it (no await between calls)', async () => {
    const { startHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, { ...BASE_PAYLOAD, requestId: 'req-a' })
    startHandler({ sender: win }, { ...BASE_PAYLOAD, requestId: 'req-b' })
    await flushMicrotasks()

    expect(spawnMock).toHaveBeenCalledTimes(1)
    proc.emit('close', 0)
    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'done', requestId: 'req-b' })
    expect(win.webContents.send).not.toHaveBeenCalledWith('inlineEdit:event', expect.objectContaining({ requestId: 'req-a' }))
  })

  it('does not affect an in-flight request in a different window', async () => {
    const { startHandler } = setup()
    const procA = fakeProc()
    const procB = fakeProc()
    spawnMock.mockReturnValueOnce(procA).mockReturnValueOnce(procB)
    const winA = fakeWin(1)
    const winB = fakeWin(2)

    startHandler({ sender: winA }, { ...BASE_PAYLOAD, requestId: 'req-a' })
    await flushMicrotasks()
    startHandler({ sender: winB }, { ...BASE_PAYLOAD, requestId: 'req-b' })
    await flushMicrotasks()

    expect(procA.kill).not.toHaveBeenCalled()
    procA.emit('close', 0)
    procB.emit('close', 0)
  })

  it('sends no events after an explicit cancel', async () => {
    const { startHandler, cancelHandler } = setup()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    startHandler({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()
    cancelHandler({ sender: win })

    win.webContents.send.mockClear()
    proc.stdout.emit('data', Buffer.from('{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"late"}}}\n'))
    proc.emit('close', 0)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})

describe('InlineEditManager timeout handling', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    execFileMock.mockReset()
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude', ''))
    _resetClaudePathCacheForTesting()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('kills the process and sends an error after the timeout with no response', async () => {
    const manager = new InlineEditManager()
    manager.registerHandlers()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    handlers['inlineEdit:start']({ sender: win }, BASE_PAYLOAD)
    await vi.advanceTimersByTimeAsync(0)
    expect(proc.kill).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30000)

    expect(proc.kill).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'error', requestId: 'req-1', message: 'Timed out' })
  })

  it('does not fire the timeout when the process closes before 30s', async () => {
    const manager = new InlineEditManager()
    manager.registerHandlers()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    handlers['inlineEdit:start']({ sender: win }, BASE_PAYLOAD)
    await vi.advanceTimersByTimeAsync(0)
    proc.emit('close', 0)

    win.webContents.send.mockClear()
    await vi.advanceTimersByTimeAsync(30000)

    expect(proc.kill).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('does not time out if a delta arrives mid-flight, resetting the idle clock', async () => {
    const manager = new InlineEditManager()
    manager.registerHandlers()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    handlers['inlineEdit:start']({ sender: win }, BASE_PAYLOAD)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(20000)
    expect(proc.kill).not.toHaveBeenCalled()

    proc.stdout.emit('data', '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"still going"}}}\n')

    // Total elapsed since spawn is now 40000ms (20000 + 20000), past the
    // original 30000ms wall-clock timeout — but only 20000ms have elapsed
    // since the delta reset the idle timer, so it must not fire yet.
    await vi.advanceTimersByTimeAsync(20000)
    expect(proc.kill).not.toHaveBeenCalled()

    // Now advance the remaining 10000ms with no further deltas: 30000ms of
    // idle time since the last delta has now elapsed, so it should fire.
    await vi.advanceTimersByTimeAsync(10000)
    expect(proc.kill).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('inlineEdit:event', { type: 'error', requestId: 'req-1', message: 'Timed out' })
  })
})

describe('InlineEditManager disposeWindow', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    execFileMock.mockReset()
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude', ''))
    _resetClaudePathCacheForTesting()
  })

  it('kills the in-flight process for that window and sends no further events', async () => {
    const manager = new InlineEditManager()
    manager.registerHandlers()
    const proc = fakeProc()
    spawnMock.mockReturnValueOnce(proc)
    const win = fakeWin(1)

    handlers['inlineEdit:start']({ sender: win }, BASE_PAYLOAD)
    await flushMicrotasks()
    manager.disposeWindow(1)

    expect(proc.kill).toHaveBeenCalled()
    win.webContents.send.mockClear()
    proc.emit('close', 0)
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
