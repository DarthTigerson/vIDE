import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
    on: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => sender,
  },
}))

import { BridgeManager } from '../bridge'

function sseStream(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]))
        i++
      } else {
        controller.close()
      }
    },
  })
  return new Response(stream, { status: 200 })
}

const SETTINGS = { endpoint: 'http://169.254.238.138:8002/v1', apiKey: 'local', modelId: 'test-model' }

describe('BridgeManager bridge:send (text-only, no tool calls)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function setup() {
    const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const manager = new BridgeManager()
    manager.registerHandlers()
    return { win, sendHandler: handlers['bridge:send'] }
  }

  it('streams text-delta events from content chunks and ends with done', async () => {
    const { win, sendHandler } = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseStream([
      'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ])))

    await sendHandler({ sender: win }, { cwd: '/project', messages: [{ role: 'user', content: 'hi' }], agentMode: false, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toEqual([
      { type: 'text-delta', delta: 'Hel' },
      { type: 'text-delta', delta: 'lo' },
      { type: 'done' },
    ])
  })

  it('sends an error event when the endpoint responds with a non-2xx status', async () => {
    const { win, sendHandler } = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))

    await sendHandler({ sender: win }, { cwd: '/project', messages: [{ role: 'user', content: 'hi' }], agentMode: false, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toEqual([{ type: 'error', message: 'Bridge request failed: 500' }])
  })

  it('posts to {endpoint}/chat/completions with the configured model and Authorization header', async () => {
    const { win, sendHandler } = setup()
    const fetchMock = vi.fn().mockResolvedValue(sseStream(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: '/project', messages: [{ role: 'user', content: 'hi' }], agentMode: false, settings: SETTINGS })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://169.254.238.138:8002/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer local', 'Content-Type': 'application/json' }),
      })
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('test-model')
    expect(body.stream).toBe(true)
  })
})

import { mkdtemp, mkdir, writeFile as writeFileFs, readFile as readFileFs, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('BridgeManager tool calls', () => {
  let root: string

  beforeEach(async () => {
    vi.restoreAllMocks()
    root = await mkdtemp(join(tmpdir(), 'bridge-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function setup() {
    const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const manager = new BridgeManager()
    manager.registerHandlers()
    return { win, sendHandler: handlers['bridge:send'], approveHandler: handlers['bridge:approve'], rejectHandler: handlers['bridge:reject'] }
  }

  function toolCallStream(name: string, args: Record<string, unknown>): Response {
    const argsJson = JSON.stringify(args)
    return sseStream([
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"${name}","arguments":""}}]},"finish_reason":null}]}\n\n`,
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(argsJson)}}}]},"finish_reason":null}]}\n\n`,
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ])
  }

  function finalTextStream(text: string): Response {
    return sseStream([
      `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}},"finish_reason":null}]}\n\n`,
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ])
  }

  it('agent mode: executes write_file immediately and continues the loop', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'out.txt')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('write_file', { path: target, content: 'hi' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'write it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('hi')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual({ type: 'tool-call', id: 'call_1', name: 'write_file', args: { path: target, content: 'hi' } })
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: false }))
    expect(events).toContainEqual({ type: 'text-delta', delta: 'done' })
    expect(events).toContainEqual({ type: 'done' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('confirm mode: waits for approval before executing, does nothing on reject', async () => {
    const { win, sendHandler, rejectHandler } = setup()
    const target = join(root, 'out.txt')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('write_file', { path: target, content: 'hi' }))
      .mockResolvedValueOnce(finalTextStream('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const runPromise = sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'write it' }], agentMode: false, settings: SETTINGS })

    await vi.waitFor(() => {
      const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      expect(events).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: target, content: 'hi' } })
    })

    rejectHandler({ sender: win }, 'call_1')
    await runPromise

    await expect(readFileFs(target, 'utf-8')).rejects.toThrow()
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: true }))
  })

  it('confirm mode: executes on approval', async () => {
    const { win, sendHandler, approveHandler } = setup()
    const target = join(root, 'out.txt')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('write_file', { path: target, content: 'hi' }))
      .mockResolvedValueOnce(finalTextStream('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const runPromise = sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'write it' }], agentMode: false, settings: SETTINGS })

    await vi.waitFor(() => {
      const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      expect(events).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: target, content: 'hi' } })
    })

    approveHandler({ sender: win }, 'call_1')
    await runPromise

    expect(await readFileFs(target, 'utf-8')).toBe('hi')
  })

  it('bridge:cancel while a tool call is awaiting approval rejects it and stops the loop', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'out.txt')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('write_file', { path: target, content: 'hi' }))
      .mockResolvedValueOnce(finalTextStream('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const runPromise = sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'write it' }], agentMode: false, settings: SETTINGS })

    await vi.waitFor(() => {
      const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      expect(events).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: target, content: 'hi' } })
    })

    handlers['bridge:cancel']({ sender: win })
    await runPromise

    await expect(readFileFs(target, 'utf-8')).rejects.toThrow()
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: true }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('run_command executes and captures stdout', async () => {
    const { win, sendHandler } = setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('run_command', { command: 'echo hello-bridge' }))
      .mockResolvedValueOnce(finalTextStream('ran it'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'run it' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    const result = events.find((e: any) => e.type === 'tool-result')
    expect(result.result).toContain('hello-bridge')
  })

  it('stops and emits an error after 40 tool-call rounds', async () => {
    const { win, sendHandler } = setup()
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(toolCallStream('run_command', { command: 'echo loop' })))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'loop forever' }], agentMode: true, settings: SETTINGS })

    expect(fetchMock).toHaveBeenCalledTimes(40)
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events[events.length - 1]).toEqual({ type: 'error', message: 'Bridge hit the 40 tool-call round limit for this turn' })
  })

  it('edit_file replaces a unique old_string with new_string', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'out.txt')
    await writeFileFs(target, 'hello world\nfoo bar\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('edit_file', { path: target, old_string: 'hello world', new_string: 'hello there' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'edit it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('hello there\nfoo bar\n')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: false }))
  })

  it('edit_file errors when old_string is not found', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'out.txt')
    await writeFileFs(target, 'hello world\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('edit_file', { path: target, old_string: 'nope', new_string: 'x' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'edit it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('hello world\n')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    const result = events.find((e: any) => e.type === 'tool-result' && e.id === 'call_1')
    expect(result).toMatchObject({ isError: true })
    expect(result.result).toContain(`old_string not found in ${target}`)
    // The error also shows the file's real lines so the model can retry with exact whitespace.
    expect(result.result).toContain('1: hello world')
  })

  it('edit_file errors when old_string is not unique', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'out.txt')
    await writeFileFs(target, 'dup\ndup\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('edit_file', { path: target, old_string: 'dup', new_string: 'x' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'edit it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('dup\ndup\n')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual({
      type: 'tool-result',
      id: 'call_1',
      result: `old_string appears 2 times in ${target} — include more surrounding context to make it unique`,
      isError: true,
    })
  })

  it('create_file creates a new file', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'new.txt')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('create_file', { path: target, content: 'fresh' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'create it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('fresh')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: false }))
  })

  it('create_file errors when the file already exists', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'existing.txt')
    await writeFileFs(target, 'already here')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('create_file', { path: target, content: 'overwrite attempt' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'create it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('already here')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual({
      type: 'tool-result',
      id: 'call_1',
      result: `${target} already exists — use edit_file or write_file`,
      isError: true,
    })
  })

  it('read_file returns the full file when no range is given', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'multi.txt')
    await writeFileFs(target, 'line1\nline2\nline3\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('read_file', { path: target }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'read it' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual({ type: 'tool-result', id: 'call_1', result: 'line1\nline2\nline3\n', isError: false })
  })

  it('read_file returns only the requested inclusive line range', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'multi.txt')
    await writeFileFs(target, 'line1\nline2\nline3\nline4\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('read_file', { path: target, startLine: 2, endLine: 3 }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'read it' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual({ type: 'tool-result', id: 'call_1', result: 'line2\nline3', isError: false })
  })

  it('grep_search finds text matches under a root path', async () => {
    const { win, sendHandler } = setup()
    await writeFileFs(join(root, 'a.txt'), 'needle here\nother line\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('grep_search', { root, query: 'needle', caseSensitive: true }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'search it' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    const result = events.find((e: any) => e.type === 'tool-result')
    expect(JSON.parse(result.result)).toEqual([{ path: join(root, 'a.txt'), line: 1, col: 1, text: 'needle here' }])
  })

  it('glob_search matches files by pattern under root', async () => {
    const { win, sendHandler } = setup()
    await mkdir(join(root, 'sub'))
    await writeFileFs(join(root, 'a.ts'), '')
    await writeFileFs(join(root, 'b.txt'), '')
    await writeFileFs(join(root, 'sub', 'c.ts'), '')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('glob_search', { pattern: '**/*.ts', root }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'find ts files' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    const result = events.find((e: any) => e.type === 'tool-result')
    const parsed = JSON.parse(result.result)
    expect(parsed.matches.sort()).toEqual([join(root, 'a.ts'), join(root, 'sub', 'c.ts')].sort())
    expect(parsed.truncated).toBe(false)
  })

  it('glob_search returns an empty, non-error, non-truncated result when no files match', async () => {
    const { win, sendHandler } = setup()
    await writeFileFs(join(root, 'a.txt'), '')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('glob_search', { pattern: '**/*.doesnotexist', root }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'find files' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    const result = events.find((e: any) => e.type === 'tool-result')
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.result)
    expect(parsed.matches).toEqual([])
    expect(parsed.truncated).toBe(false)
  })

  it('glob_search finds matches correctly when root has a trailing slash', async () => {
    const { win, sendHandler } = setup()
    await mkdir(join(root, 'sub'))
    await writeFileFs(join(root, 'a.ts'), '')
    await writeFileFs(join(root, 'sub', 'c.ts'), '')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('glob_search', { pattern: '**/*.ts', root: root + '/' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'find ts files' }], agentMode: true, settings: SETTINGS })

    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    const result = events.find((e: any) => e.type === 'tool-result')
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.result)
    expect(parsed.matches.sort()).toEqual([join(root, 'a.ts'), join(root, 'sub', 'c.ts')].sort())
  })

  it('edit_file preserves a literal $ in new_string instead of expanding it as a replace pattern', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'out.txt')
    await writeFileFs(target, 'const a = foo;\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('edit_file', { path: target, old_string: 'foo', new_string: '$&bar' }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'edit it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(target, 'utf-8')).toBe('const a = $&bar;\n')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: false }))
  })

  it('move_file refuses to clobber an existing destination', async () => {
    const { win, sendHandler } = setup()
    const from = join(root, 'old.txt')
    const to = join(root, 'new.txt')
    await writeFileFs(from, 'source content')
    await writeFileFs(to, 'destination content')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('move_file', { from, to }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'move it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(from, 'utf-8')).toBe('source content')
    expect(await readFileFs(to, 'utf-8')).toBe('destination content')
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: true }))
  })

  it('delete_file removes the file', async () => {
    const { win, sendHandler } = setup()
    const target = join(root, 'gone.txt')
    await writeFileFs(target, 'bye')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('delete_file', { path: target }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'delete it' }], agentMode: true, settings: SETTINGS })

    await expect(readFileFs(target, 'utf-8')).rejects.toThrow()
    const events = win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: false }))
  })

  it('move_file renames the file', async () => {
    const { win, sendHandler } = setup()
    const from = join(root, 'old.txt')
    const to = join(root, 'new.txt')
    await writeFileFs(from, 'content')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('move_file', { from, to }))
      .mockResolvedValueOnce(finalTextStream('done'))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: root, messages: [{ role: 'user', content: 'move it' }], agentMode: true, settings: SETTINGS })

    expect(await readFileFs(to, 'utf-8')).toBe('content')
    await expect(readFileFs(from, 'utf-8')).rejects.toThrow()
  })

  it('two windows awaiting approval on the same tool-call id are independent: approving window B does not resolve window A', async () => {
    const manager = new BridgeManager()
    manager.registerHandlers()
    const winA = { id: 301, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const winB = { id: 302, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const sendHandler = handlers['bridge:send']
    const approveHandler = handlers['bridge:approve']
    const rejectHandler = handlers['bridge:reject']
    const targetA = join(root, 'winA.txt')
    const targetB = join(root, 'winB.txt')

    // Both conversations share the same global `fetch` mock, so route the
    // response by inspecting the request body instead of relying on call
    // order (which round-robins unpredictably between two concurrently
    // in-flight conversations).
    const fetchMock = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      const userMsg = body.messages.find((m: any) => m.role === 'user')?.content
      const isFirstRound = !body.messages.some((m: any) => m.role === 'tool')
      if (userMsg === 'write A') {
        return isFirstRound ? toolCallStream('write_file', { path: targetA, content: 'A' }) : finalTextStream('doneA')
      }
      return isFirstRound ? toolCallStream('write_file', { path: targetB, content: 'B' }) : finalTextStream('doneB')
    })
    vi.stubGlobal('fetch', fetchMock)

    const runA = sendHandler({ sender: winA }, { cwd: root, messages: [{ role: 'user', content: 'write A' }], agentMode: false, settings: SETTINGS })
    const runB = sendHandler({ sender: winB }, { cwd: root, messages: [{ role: 'user', content: 'write B' }], agentMode: false, settings: SETTINGS })

    await vi.waitFor(() => {
      const eventsA = winA.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      const eventsB = winB.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      expect(eventsA).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: targetA, content: 'A' } })
      expect(eventsB).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: targetB, content: 'B' } })
    })

    // Approve only window B's call_1 — window A's identically-id'd pending
    // approval must be unaffected, since each window has its own approvals map.
    approveHandler({ sender: winB }, 'call_1')
    await runB

    expect(await readFileFs(targetB, 'utf-8')).toBe('B')
    const eventsAAfterBApproved = winA.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(eventsAAfterBApproved.some((e: any) => e.type === 'tool-result')).toBe(false)
    await expect(readFileFs(targetA, 'utf-8')).rejects.toThrow()

    // Clean up window A's still-pending conversation so its promise settles.
    rejectHandler({ sender: winA }, 'call_1')
    await runA
    await expect(readFileFs(targetA, 'utf-8')).rejects.toThrow()
  })

  it('disposeWindow rejects and clears only the disposed window\'s pending approval, leaving another window\'s conversation untouched', async () => {
    const manager = new BridgeManager()
    manager.registerHandlers()
    const winA = { id: 401, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const winB = { id: 402, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const sendHandler = handlers['bridge:send']
    const approveHandler = handlers['bridge:approve']
    const targetA = join(root, 'disposeA.txt')
    const targetB = join(root, 'disposeB.txt')

    const fetchMock = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      const userMsg = body.messages.find((m: any) => m.role === 'user')?.content
      const isFirstRound = !body.messages.some((m: any) => m.role === 'tool')
      if (userMsg === 'dispose A') {
        return isFirstRound ? toolCallStream('write_file', { path: targetA, content: 'A' }) : finalTextStream('doneA')
      }
      return isFirstRound ? toolCallStream('write_file', { path: targetB, content: 'B' }) : finalTextStream('doneB')
    })
    vi.stubGlobal('fetch', fetchMock)

    const runA = sendHandler({ sender: winA }, { cwd: root, messages: [{ role: 'user', content: 'dispose A' }], agentMode: false, settings: SETTINGS })
    const runB = sendHandler({ sender: winB }, { cwd: root, messages: [{ role: 'user', content: 'dispose B' }], agentMode: false, settings: SETTINGS })

    await vi.waitFor(() => {
      const eventsA = winA.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      const eventsB = winB.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
      expect(eventsA).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: targetA, content: 'A' } })
      expect(eventsB).toContainEqual({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: targetB, content: 'B' } })
    })

    manager.disposeWindow(winA.id)
    await runA

    const eventsA = winA.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(eventsA).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'call_1', isError: true }))
    await expect(readFileFs(targetA, 'utf-8')).rejects.toThrow()

    const eventsBAfterDispose = winB.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
    expect(eventsBAfterDispose.some((e: any) => e.type === 'tool-result')).toBe(false)

    approveHandler({ sender: winB }, 'call_1')
    await runB
    expect(await readFileFs(targetB, 'utf-8')).toBe('B')
  })
})

describe('BridgeManager system prompt', () => {
  beforeEach(() => vi.restoreAllMocks())

  function setup() {
    const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const manager = new BridgeManager()
    manager.registerHandlers()
    return { win, sendHandler: handlers['bridge:send'] }
  }

  it('prepends the tool-priority system message when none is present', async () => {
    const { win, sendHandler } = setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(sseStream(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, { cwd: '/project', messages: [{ role: 'user', content: 'hi' }], agentMode: false, settings: SETTINGS })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('edit_file')
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })

  it('does not duplicate the system message if one is already present', async () => {
    const { win, sendHandler } = setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(sseStream(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await sendHandler({ sender: win }, {
      cwd: '/project',
      messages: [{ role: 'system', content: 'custom' }, { role: 'user', content: 'hi' }],
      agentMode: false,
      settings: SETTINGS,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'system', content: 'custom' }, { role: 'user', content: 'hi' }])
  })
})

describe('BridgeManager bridge:testConnection', () => {
  beforeEach(() => vi.restoreAllMocks())

  function setup() {
    const manager = new BridgeManager()
    manager.registerHandlers()
    return handlers['bridge:testConnection']
  }

  it('returns ok:true when the endpoint responds with 200', async () => {
    const testHandler = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))

    const result = await testHandler({}, SETTINGS)
    expect(result).toEqual({ ok: true })
  })

  it('returns ok:false with an error message on failure', async () => {
    const testHandler = setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    const result = await testHandler({}, SETTINGS)
    expect(result).toEqual({ ok: false, error: 'connect ECONNREFUSED' })
  })

  it('returns ok:false with the status code on a non-2xx response', async () => {
    const testHandler = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })))

    const result = await testHandler({}, SETTINGS)
    expect(result).toEqual({ ok: false, error: 'HTTP 401' })
  })
})
