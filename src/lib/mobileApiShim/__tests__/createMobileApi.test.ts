import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMobileApi } from '../createMobileApi'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }
  send(data: string) { this.sent.push(data) }
}

async function tick() {
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
}

describe('createMobileApi', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves an invoke call when a matching response arrives', async () => {
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const resultPromise = api.gitStatus('/repo')
    const sent = JSON.parse(ws.sent[0])
    expect(sent).toMatchObject({ type: 'invoke', method: 'git:status', args: ['/repo'] })
    ws.onmessage?.({ data: JSON.stringify({ type: 'response', id: sent.id, result: { staged: [], unstaged: [] } }) })
    await expect(resultPromise).resolves.toEqual({ staged: [], unstaged: [] })
  })

  it('dispatches a pushed event to a registered on* callback', async () => {
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const cb = vi.fn()
    api.onGitChanged(cb)
    ws.onmessage?.({ data: JSON.stringify({ type: 'event', event: 'git:changed', args: ['/repo'] }) })
    expect(cb).toHaveBeenCalledWith('/repo')
  })

  it('rejects the pending invoke when the response carries an error', async () => {
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const resultPromise = api.gitStatus('/repo')
    const sent = JSON.parse(ws.sent[0])
    ws.onmessage?.({ data: JSON.stringify({ type: 'response', id: sent.id, error: 'boom' }) })
    await expect(resultPromise).rejects.toThrow('boom')
  })

  it('sends fire-and-forget calls as send messages without waiting for a response', async () => {
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    api.termWrite('term-1', 'hello')
    const sent = JSON.parse(ws.sent[0])
    expect(sent).toEqual({ type: 'send', method: 'term:write', args: ['term-1', 'hello'] })
  })

  it('returns an unsubscribe function from on* registrations', async () => {
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const cb = vi.fn()
    const unsubscribe = api.onTermData(cb)
    unsubscribe()
    ws.onmessage?.({ data: JSON.stringify({ type: 'event', event: 'term:data', args: ['term-1', 'hi'] }) })
    expect(cb).not.toHaveBeenCalled()
  })

  it('generates request ids without crypto.randomUUID (unavailable on plain-HTTP LAN origins)', async () => {
    // Crypto.randomUUID is spec'd secure-context-only: a real phone loading
    // this bundle over plain http://<lan-ip> (MobileServer's pairing URL,
    // not localhost/https) sees it as undefined. Simulate that.
    vi.stubGlobal('crypto', {})
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const resultPromise = api.gitStatus('/repo')
    const sent = JSON.parse(ws.sent[0])
    expect(typeof sent.id).toBe('string')
    expect(sent.id.length).toBeGreaterThan(0)
    ws.onmessage?.({ data: JSON.stringify({ type: 'response', id: sent.id, result: 'ok' }) })
    await expect(resultPromise).resolves.toBe('ok')
  })

  it('rejects every pending invoke and reloads the page when the connection closes', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const first = api.gitStatus('/repo')
    const second = api.gitBranch('/repo')

    ws.onclose?.()

    await expect(first).rejects.toThrow('mobile relay connection lost')
    await expect(second).rejects.toThrow('mobile relay connection lost')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('rejects every pending invoke and reloads the page on a socket error', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
    const api = createMobileApi('ws://host/relay')
    await tick()
    const ws = FakeWebSocket.instances[0]
    const pendingCall = api.gitStatus('/repo')

    ws.onerror?.()

    await expect(pendingCall).rejects.toThrow('mobile relay connection lost')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('queues an invoke/send call issued before the socket opens and flushes it once open', async () => {
    const api = createMobileApi('ws://host/relay')
    const ws = FakeWebSocket.instances[0]

    // Called synchronously, before the FakeWebSocket's queued onopen
    // microtask has had a chance to run — the socket is still CONNECTING.
    const resultPromise = api.gitStatus('/repo')
    api.termWrite('term-1', 'hello')
    expect(ws.sent).toHaveLength(0)

    await tick()

    expect(ws.sent).toHaveLength(2)
    const [invokeSent, sendSent] = ws.sent.map((s) => JSON.parse(s))
    expect(invokeSent).toMatchObject({ type: 'invoke', method: 'git:status', args: ['/repo'] })
    expect(sendSent).toEqual({ type: 'send', method: 'term:write', args: ['term-1', 'hello'] })

    ws.onmessage?.({ data: JSON.stringify({ type: 'response', id: invokeSent.id, result: 'ok' }) })
    await expect(resultPromise).resolves.toBe('ok')
  })
})
