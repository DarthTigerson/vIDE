import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMobileApi } from '../createMobileApi'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  sent: string[] = []
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }
  send(data: string) { this.sent.push(data) }
}

describe('createMobileApi', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  it('resolves an invoke call when a matching response arrives', async () => {
    const api = createMobileApi('ws://host/relay')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const ws = FakeWebSocket.instances[0]
    const resultPromise = api.gitStatus('/repo')
    const sent = JSON.parse(ws.sent[0])
    expect(sent).toMatchObject({ type: 'invoke', method: 'git:status', args: ['/repo'] })
    ws.onmessage?.({ data: JSON.stringify({ type: 'response', id: sent.id, result: { staged: [], unstaged: [] } }) })
    await expect(resultPromise).resolves.toEqual({ staged: [], unstaged: [] })
  })

  it('dispatches a pushed event to a registered on* callback', async () => {
    const api = createMobileApi('ws://host/relay')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const ws = FakeWebSocket.instances[0]
    const cb = vi.fn()
    api.onGitChanged(cb)
    ws.onmessage?.({ data: JSON.stringify({ type: 'event', event: 'git:changed', args: ['/repo'] }) })
    expect(cb).toHaveBeenCalledWith('/repo')
  })

  it('rejects the pending invoke when the response carries an error', async () => {
    const api = createMobileApi('ws://host/relay')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const ws = FakeWebSocket.instances[0]
    const resultPromise = api.gitStatus('/repo')
    const sent = JSON.parse(ws.sent[0])
    ws.onmessage?.({ data: JSON.stringify({ type: 'response', id: sent.id, error: 'boom' }) })
    await expect(resultPromise).rejects.toThrow('boom')
  })

  it('sends fire-and-forget calls as send messages without waiting for a response', async () => {
    const api = createMobileApi('ws://host/relay')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const ws = FakeWebSocket.instances[0]
    api.termWrite('term-1', 'hello')
    const sent = JSON.parse(ws.sent[0])
    expect(sent).toEqual({ type: 'send', method: 'term:write', args: ['term-1', 'hello'] })
  })

  it('returns an unsubscribe function from on* registrations', async () => {
    const api = createMobileApi('ws://host/relay')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const ws = FakeWebSocket.instances[0]
    const cb = vi.fn()
    const unsubscribe = api.onTermData(cb)
    unsubscribe()
    ws.onmessage?.({ data: JSON.stringify({ type: 'event', event: 'term:data', args: ['term-1', 'hi'] }) })
    expect(cb).not.toHaveBeenCalled()
  })
})
