import { describe, it, expect, afterEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: any[]) => any> }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
    on: (channel: string, fn: (...args: any[]) => unknown) => { handlers[channel] = fn },
  },
  BrowserWindow: { fromWebContents: (sender: any) => sender },
}))

import { BridgeManager } from '../bridge'
import { summarize } from '../bridgeCompact'
import type { BridgeCloak } from '../vcloak'

const SETTINGS = { endpoint: 'http://127.0.0.1:8899/v1', apiKey: 'local', modelId: 'm' }

const swap = (s: string, a: string, b: string) => s.split(a).join(b)
const fakeCloak = {
  maskBody: <T,>(body: T): T => JSON.parse(swap(JSON.stringify(body), 'secret-repo', 'maskedname')),
  unmaskText: (s: string) => swap(s, 'maskedname', 'secret-repo'),
}

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

const textStream = () => sseStream([
  'data: {"choices":[{"delta":{"content":"see maskedname"},"finish_reason":null}]}\n\n',
  'data: [DONE]\n\n',
])

const toolStream = () => sseStream([
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"list_dir","arguments":"{\\"path\\":\\"/tmp/maskedname\\"}"}}]},"finish_reason":null}]}\n\n',
  'data: [DONE]\n\n',
])

function setup(forBridge: (cwd?: string) => Promise<BridgeCloak>) {
  const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
  const manager = new BridgeManager()
  manager.setCloak({ forBridge })
  manager.registerHandlers()
  return { win, send: handlers['bridge:send'], manager }
}

const events = (win: any) => win.webContents.send.mock.calls.filter((c: any[]) => c[0] === 'bridge:event').map((c: any[]) => c[1])

describe('BridgeManager with vCloak', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('masks the request body and restores names in the streamed reply', async () => {
    const { win, send } = setup(async () => ({ ok: true, cloak: fakeCloak }))
    const fetchMock = vi.fn().mockResolvedValue(textStream())
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'open secret-repo' }], agentMode: false, settings: SETTINGS })

    const sent = fetchMock.mock.calls[0][1].body as string
    expect(sent).toContain('maskedname')
    expect(sent).not.toContain('secret-repo')
    const text = events(win).filter((e: any) => e.type === 'text-delta').map((e: any) => e.delta).join('')
    expect(text).toBe('see secret-repo')
    expect(text).not.toContain('maskedname')
  })

  it('restores names in tool call arguments', async () => {
    const { win, send } = setup(async () => ({ ok: true, cloak: fakeCloak }))
    const chat = [toolStream(), textStream()]
    const fetchMock = vi.fn(async (..._a: unknown[]) => chat.shift()!)
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'go' }], agentMode: true, settings: SETTINGS })

    // The tool-call event (and so the tool itself) sees the real name
    const call = events(win).find((e: any) => e.type === 'tool-call')
    expect(call.args).toEqual({ path: '/tmp/secret-repo' })
    // while the history sent back to the model stays masked
    const second = fetchMock.mock.calls[1] as any[]
    expect(second[1].body).not.toContain('secret-repo')
  })

  it('does not send anything when vCloak blocks', async () => {
    const { win, send } = setup(async () => ({ ok: false, error: 'x' }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'hi' }], agentMode: false, settings: SETTINGS })

    expect(fetchMock).not.toHaveBeenCalled()
    const errors = events(win).filter((e: any) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message.startsWith('vCloak blocked this Bridge request')).toBe(true)
  })

  it('does not send anything when masking throws', async () => {
    const throwing = { maskBody: () => { throw new Error('cannot mask') }, unmaskText: (s: string) => s }
    const { win, send } = setup(async () => ({ ok: true, cloak: throwing as never }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'hi' }], agentMode: false, settings: SETTINGS })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(events(win).find((e: any) => e.type === 'error').message).toMatch(/^vCloak blocked this Bridge request/)
  })

  it('behaves as before when forBridge returns null', async () => {
    const { win, send } = setup(async () => null)
    const fetchMock = vi.fn().mockResolvedValue(sseStream([
      'data: {"choices":[{"delta":{"content":"maskedname"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await send({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'open secret-repo' }], agentMode: false, settings: SETTINGS })

    expect(fetchMock.mock.calls[0][1].body).toContain('secret-repo')
    expect(events(win)).toContainEqual({ type: 'text-delta', delta: 'maskedname' })
  })

  it('behaves as before with no cloak source', async () => {
    const win = { id: 1, isDestroyed: () => false, webContents: { send: vi.fn() } }
    const manager = new BridgeManager()
    manager.setCloak(null)
    manager.registerHandlers()
    const fetchMock = vi.fn().mockResolvedValue(textStream())
    vi.stubGlobal('fetch', fetchMock)

    await handlers['bridge:send']({ sender: win }, { cwd: '/tmp', messages: [{ role: 'user', content: 'open secret-repo' }], agentMode: false, settings: SETTINGS })

    expect(fetchMock.mock.calls[0][1].body).toContain('secret-repo')
  })
})

describe('summarize with vCloak', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('masks the request and unmasks the summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'worked on maskedname' } }] })))
    vi.stubGlobal('fetch', fetchMock)

    const out = await summarize(SETTINGS, [{ role: 'user', content: 'fix secret-repo' }], null, undefined, undefined, fakeCloak)

    const body = fetchMock.mock.calls[0][1].body as string
    expect(body).toContain('maskedname')
    expect(body).not.toContain('secret-repo')
    expect(out).toBe('worked on secret-repo')
  })

  it('leaves both untouched without a cloak', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'maskedname' } }] })))
    vi.stubGlobal('fetch', fetchMock)

    const out = await summarize(SETTINGS, [{ role: 'user', content: 'fix secret-repo' }], null)

    expect(fetchMock.mock.calls[0][1].body).toContain('secret-repo')
    expect(out).toBe('maskedname')
  })
})
