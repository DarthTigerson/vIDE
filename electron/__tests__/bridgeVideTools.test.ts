import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const { handlers, stopDecision } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  stopDecision: { fn: null as null | ((dataDir: string, input: { stop_hook_active?: boolean }) => Promise<unknown>) },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
    on: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
  },
  BrowserWindow: { fromWebContents: (sender: any) => sender },
}))

vi.mock('../mcp/todoEnforcerHook', () => ({
  decideStopAction: (dataDir: string, input: { stop_hook_active?: boolean }) =>
    stopDecision.fn ? stopDecision.fn(dataDir, input) : Promise.resolve(null),
}))

import { BridgeManager } from '../bridge'
import { buildVideTools, toolResultText } from '../bridgeVideTools'

function sseStream(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  return new Response(new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]))
      else controller.close()
    },
  }), { status: 200 })
}

function toolCallStream(name: string, args: Record<string, unknown>): Response {
  return sseStream([
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"${name}","arguments":${JSON.stringify(JSON.stringify(args))}}}]},"finish_reason":null}]}\n\n`,
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ])
}

function finalTextStream(text: string): Response {
  return sseStream([
    `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}},"finish_reason":null}]}\n\n`,
    'data: [DONE]\n\n',
  ])
}

const SETTINGS = { endpoint: 'http://127.0.0.1:8899/v1', apiKey: 'local', modelId: 'test-model' }

function sentToolNames(fetchMock: ReturnType<typeof vi.fn>, call = 0): string[] {
  const body = JSON.parse(fetchMock.mock.calls[call][1].body)
  return body.tools.map((t: any) => t.function.name)
}

describe('buildVideTools', () => {
  it('builds the same tool groups the MCP servers expose, with their instructions', () => {
    const { tools, instructions } = buildVideTools(['todos', 'notes', 'search'], { dataDir: '/data' }, 1)
    const names = tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['create_todo', 'start_todo', 'add_todo_comment', 'write_note', 'web_search']))
    expect(instructions.some((i) => i.includes('start_todo'))).toBe(true)
  })

  it('skips browser tools without the shim socket', () => {
    expect(buildVideTools(['browser'], { dataDir: '/data' }, 1).tools).toEqual([])
    expect(buildVideTools(['browser'], { dataDir: '/data', socketPath: '/s.sock' }, 1).tools.length).toBeGreaterThan(0)
  })

  it('turns an image result into text', () => {
    expect(toolResultText({ text: 'shot', image: { data: 'x', mimeType: 'image/png' } })).toContain('image/png image omitted')
  })
})

describe('BridgeManager with vIDE tools', () => {
  let dataDir: string

  beforeEach(async () => {
    stopDecision.fn = null
    dataDir = await mkdtemp(join(tmpdir(), 'bridge-vide-'))
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(dataDir, { recursive: true, force: true })
  })

  function setup() {
    const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
    new BridgeManager({ dataDir }).registerHandlers()
    return { win, send: handlers['bridge:send'] }
  }

  function events(win: { webContents: { send: ReturnType<typeof vi.fn> } }) {
    return win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
  }

  it('offers every vIDE tool group by default, alongside the file tools', async () => {
    const { win, send } = setup()
    const fetchMock = vi.fn().mockResolvedValue(finalTextStream('hi'))
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: dataDir, messages: [{ role: 'user', content: 'hi' }], agentMode: true, settings: SETTINGS })

    expect(sentToolNames(fetchMock)).toEqual(expect.arrayContaining(['read_file', 'create_todo', 'write_note', 'create_script', 'web_search']))
    const system = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content
    expect(system).toContain('start_todo')
  })

  it('follows the enabled groups, keeping web search always on', async () => {
    const { win, send } = setup()
    const fetchMock = vi.fn().mockResolvedValue(finalTextStream('hi'))
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: dataDir, messages: [{ role: 'user', content: 'hi' }], agentMode: true, settings: { ...SETTINGS, videTools: ['notes'] } })

    const names = sentToolNames(fetchMock)
    expect(names).toEqual(expect.arrayContaining(['write_note', 'web_search']))
    expect(names).not.toContain('create_todo')
  })

  it('runs a vIDE tool through the same handler the MCP server uses', async () => {
    const { win, send } = setup()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(toolCallStream('write_note', { path: 'plan.md', content: '# Plan' }))
      .mockResolvedValueOnce(finalTextStream('saved')))

    await send({ sender: win }, { cwd: dataDir, messages: [{ role: 'user', content: 'note it' }], agentMode: true, settings: SETTINGS })

    const result = events(win).find((e: any) => e.type === 'tool-result')
    expect(result.isError).toBe(false)
    expect(await readFile(join(dataDir, 'notes', 'plan.md'), 'utf-8')).toBe('# Plan')
  })

  it('blocks finishing once after start_todo until the todo enforcer is satisfied', async () => {
    const { win, send } = setup()
    stopDecision.fn = async (_dir, input) => (input.stop_hook_active ? null : { decision: 'block', reason: 'Comment on VIDE-1 first.' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolCallStream('start_todo', { id: 'VIDE-1' }))
      .mockResolvedValueOnce(finalTextStream('all done'))
      .mockResolvedValueOnce(finalTextStream('commented'))
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: dataDir, messages: [{ role: 'user', content: 'work' }], agentMode: true, settings: SETTINGS })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const third = JSON.parse(fetchMock.mock.calls[2][1].body).messages
    expect(third.at(-1)).toEqual({ role: 'user', content: 'Comment on VIDE-1 first.' })
    expect(events(win).at(-1)).toEqual({ type: 'done' })
  })

  it('does not consult the enforcer when the run never started a todo', async () => {
    const { win, send } = setup()
    const decide = vi.fn(async () => ({ decision: 'block', reason: 'x' }))
    stopDecision.fn = decide
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(finalTextStream('hi')))

    await send({ sender: win }, { cwd: dataDir, messages: [{ role: 'user', content: 'hi' }], agentMode: true, settings: SETTINGS })

    expect(decide).not.toHaveBeenCalled()
    expect(events(win).at(-1)).toEqual({ type: 'done' })
  })
})
