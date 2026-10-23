import { describe, it, expect, afterEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: any[]) => any> }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
    on: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
  },
  BrowserWindow: { fromWebContents: (sender: any) => sender },
}))

import { BridgeManager, compactThreshold, type BridgeMessage } from '../bridge'
import { compactMessages, isContextOverflow, renderTranscript, SUMMARY_PREFIX } from '../bridgeCompact'
import { requestDispatcher } from '../bridgeHttp'

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

const usageChunk = (prompt: number) => `data: {"choices":[],"usage":{"prompt_tokens":${prompt},"completion_tokens":10}}\n\n`

function toolCallStream(id: string, prompt: number): Response {
  return sseStream([
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${id}","function":{"name":"list_dir","arguments":"{\\"path\\":\\"/tmp\\"}"}}]},"finish_reason":null}]}\n\n`,
    usageChunk(prompt),
    'data: [DONE]\n\n',
  ])
}

function finalTextStream(text: string, prompt = 50): Response {
  return sseStream([
    `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}},"finish_reason":null}]}\n\n`,
    usageChunk(prompt),
    'data: [DONE]\n\n',
  ])
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const SETTINGS = { endpoint: 'http://127.0.0.1:8899/v1', apiKey: 'local', modelId: 'm' }

function round(id: string): BridgeMessage[] {
  return [
    { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: '{"path":"/p/a.ts"}' } }] },
    { role: 'tool', tool_call_id: id, content: `result ${id}` },
  ]
}

describe('compactMessages', () => {
  it('keeps the system prompt, adds the summary, and keeps the last two rounds verbatim', () => {
    const messages: BridgeMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'build the spec' },
      ...round('a'), ...round('b'), ...round('c'),
    ]
    const out = compactMessages(messages, 'did a, b, c')
    expect(out[0]).toEqual({ role: 'system', content: 'sys' })
    expect(out[1]).toEqual({ role: 'user', content: `${SUMMARY_PREFIX}\n\ndid a, b, c` })
    expect(out.slice(2)).toEqual([...round('b'), ...round('c')])
  })

  it('keeps nothing after the summary when there are no tool rounds (between turns)', () => {
    const out = compactMessages([{ role: 'system', content: 's' }, { role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }], 'sum')
    expect(out).toHaveLength(2)
  })
})

describe('renderTranscript', () => {
  it('labels speakers, names tool results, and clips big tool output', () => {
    const text = renderTranscript([
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'read it' },
      { role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't', content: 'y'.repeat(5000) },
    ], null)
    expect(text).not.toContain('hidden')
    expect(text).toContain('USER:\nread it')
    expect(text).toContain('TOOL RESULT read_file:')
    expect(text).toContain('more chars]')
  })

  it('cuts the middle, not the start or end, to fit the window', () => {
    const messages: BridgeMessage[] = [{ role: 'user', content: 'FIRST' }]
    for (let i = 0; i < 200; i++) messages.push({ role: 'assistant', content: `step ${i} ${'z'.repeat(100)}` })
    messages.push({ role: 'user', content: 'LAST' })
    const text = renderTranscript(messages, 2000)
    expect(text.startsWith('USER:\nFIRST')).toBe(true)
    expect(text.endsWith('USER:\nLAST')).toBe(true)
    expect(text).toContain('omitted')
  })
})

describe('isContextOverflow', () => {
  it('recognises llama.cpp and OpenAI-style context errors only', () => {
    expect(isContextOverflow(400, '{"error":{"message":"the request exceeds the available context size, try increasing it"}}')).toBe(true)
    expect(isContextOverflow(400, "This model's maximum context length is 8192 tokens")).toBe(true)
    expect(isContextOverflow(400, 'invalid tool schema')).toBe(false)
    expect(isContextOverflow(401, 'context size')).toBe(false)
  })
})

describe('BridgeManager compaction', () => {
  afterEach(() => vi.unstubAllGlobals())

  function setup() {
    const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
    new BridgeManager().registerHandlers()
    return { win, send: handlers['bridge:send'] }
  }

  const events = (win: any) => win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])
  const chatBodies = (fetchMock: any) =>
    fetchMock.mock.calls.filter((c: any[]) => String(c[0]).endsWith('/chat/completions')).map((c: any[]) => JSON.parse(c[1].body))

  it('auto-compacts mid-turn once usage passes 80% of the window from /props', async () => {
    const { win, send } = setup()
    const chat = [toolCallStream('a', 100), toolCallStream('b', 850), json({ choices: [{ message: { content: 'SUMMARY' } }] }), finalTextStream('done')]
    const fetchMock = vi.fn(async (url: string) => (url.endsWith('/props') ? json({ default_generation_settings: { n_ctx: 1000 } }) : chat.shift()!))
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'go' }], agentMode: true, settings: SETTINGS })

    const ev = events(win)
    expect(ev).toContainEqual({ type: 'usage', usedTokens: 110, contextWindow: 1000 })
    expect(ev).toContainEqual({ type: 'compacting' })
    expect(ev).toContainEqual({ type: 'compacted', summary: 'SUMMARY', content: `${SUMMARY_PREFIX}\n\nSUMMARY` })
    expect(ev.at(-1)).toEqual({ type: 'done' })

    const bodies = chatBodies(fetchMock)
    expect(bodies[0].stream_options).toEqual({ include_usage: true })
    expect(bodies[2].stream).toBe(false) // the summary request
    const after = bodies[3].messages
    expect(after[1]).toEqual({ role: 'user', content: `${SUMMARY_PREFIX}\n\nSUMMARY` })
    expect(after.slice(2).map((m: any) => m.tool_calls?.[0]?.id ?? m.role)).toEqual(['a', 'tool', 'b', 'tool'])
  })

  it('compacts at compactAtTokens when that comes before 80% of a huge window', async () => {
    const { win, send } = setup()
    const chat = [toolCallStream('a', 100), toolCallStream('b', 850), json({ choices: [{ message: { content: 'SUMMARY' } }] }), finalTextStream('done')]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/props') ? json({ default_generation_settings: { n_ctx: 262144 } }) : chat.shift()!)))

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'go' }], agentMode: true, settings: { ...SETTINGS, compactAtTokens: 500 } })

    expect(events(win)).toContainEqual(expect.objectContaining({ type: 'compacted', summary: 'SUMMARY' }))
  })

  it('compactThreshold takes the lower of 80% of the window and the cap', () => {
    expect(compactThreshold(262144, 65536)).toBe(65536)
    expect(compactThreshold(32768, 65536)).toBe(32768 * 0.8)
    expect(compactThreshold(null, 65536)).toBe(65536)
    expect(compactThreshold(1000)).toBe(800)
    expect(compactThreshold(null)).toBeNull()
  })

  it('compacts and retries once when the server rejects the prompt as too long', async () => {
    const { win, send } = setup()
    const chat = [
      json({ error: { message: 'the request exceeds the available context size' } }, 400),
      json({ choices: [{ message: { content: 'SHORT' } }] }),
      finalTextStream('fits now'),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/props') ? json({}, 404) : chat.shift()!)))

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'huge' }], agentMode: true, settings: SETTINGS })

    const ev = events(win)
    expect(ev).toContainEqual(expect.objectContaining({ type: 'compacted', summary: 'SHORT' }))
    expect(ev.at(-1)).toEqual({ type: 'done' })
  })

  it('gives up with an error when the prompt still overflows after compacting', async () => {
    const { win, send } = setup()
    const overflow = () => json({ error: { message: 'the request exceeds the available context size' } }, 400)
    const chat = [overflow(), json({ choices: [{ message: { content: 'S' } }] }), overflow()]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/props') ? json({}, 404) : chat.shift()!)))

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'huge' }], agentMode: true, settings: SETTINGS })

    expect(events(win).at(-1)).toEqual({ type: 'error', message: "Bridge request is larger than the model's context, even after compacting" })
  })

  it('manual compact returns the summary for the transcript it is given', async () => {
    new BridgeManager().registerHandlers()
    const fetchMock = vi.fn(async (url: string) => (url.endsWith('/props') ? json({}, 404) : json({ choices: [{ message: { content: 'MANUAL' } }] })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await handlers['bridge:compact']({}, { messages: [{ role: 'user', content: 'hi' }], settings: SETTINGS, focus: 'the API' })

    expect(result).toEqual({ ok: true, summary: 'MANUAL', content: `${SUMMARY_PREFIX}\n\nMANUAL` })
    const body = JSON.parse(fetchMock.mock.calls.find((c: any[]) => String(c[0]).endsWith('/chat/completions'))![1].body)
    expect(body.messages[1].content).toContain('focus on: the API')
  })

  it('sends the summary request through the configured timeout dispatcher', async () => {
    new BridgeManager().registerHandlers()
    const fetchMock = vi.fn(async (url: string, _init?: any) => (url.endsWith('/props') ? json({}, 404) : json({ choices: [{ message: { content: 'S' } }] })))
    vi.stubGlobal('fetch', fetchMock)

    await handlers['bridge:compact']({}, { messages: [{ role: 'user', content: 'hi' }], settings: { ...SETTINGS, requestTimeoutMs: 0 } })

    const init = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/chat/completions'))![1]
    expect(init.dispatcher).toBe(requestDispatcher(0))
  })
})
