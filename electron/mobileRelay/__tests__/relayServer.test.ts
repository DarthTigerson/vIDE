import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'http'
import WebSocket from 'ws'
import { createRelayServer, isSameOriginUpgrade, type RelayConnection } from '../relayServer'

function withServer(sessionFor: (cookie: string | undefined) => string | null) {
  const httpServer = createServer()
  const onConnection = vi.fn<(conn: RelayConnection, token: string) => void>()
  createRelayServer(httpServer, { sessionFor, onConnection })
  return new Promise<{ port: number; onConnection: typeof onConnection; close: () => void }>((resolve) => {
    httpServer.listen(0, () => {
      const address = httpServer.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ port, onConnection, close: () => httpServer.close() })
    })
  })
}

function expectRejected(ws: WebSocket): Promise<void> {
  // A rejected handshake always emits 'error' on the ws client before 'close';
  // without a listener Node throws on the unhandled 'error' event.
  ws.on('error', () => {})
  return new Promise<void>((resolve) => ws.on('close', () => resolve()))
}

describe('createRelayServer auth gate', () => {
  it('rejects a connection without a valid session cookie', async () => {
    const { port, onConnection, close } = await withServer(() => null)
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=bad' }, origin: `http://127.0.0.1:${port}` })
    await expectRejected(ws)
    expect(onConnection).not.toHaveBeenCalled()
    close()
  })

  it('accepts a same-origin connection with a valid session cookie and passes its token', async () => {
    const { port, onConnection, close } = await withServer(() => 'tok')
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=good' }, origin: `http://127.0.0.1:${port}` })
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))
    expect(onConnection).toHaveBeenCalledTimes(1)
    expect(onConnection.mock.calls[0][1]).toBe('tok')
    expect(onConnection.mock.calls[0][0].cookieHeader).toBe('session=good')
    ws.close()
    close()
  })

  it('rejects a valid session from another origin', async () => {
    const { port, onConnection, close } = await withServer(() => 'tok')
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=good' }, origin: 'http://evil.example' })
    await expectRejected(ws)
    expect(onConnection).not.toHaveBeenCalled()
    close()
  })

  it('rejects a handshake with no Origin header', async () => {
    const { port, onConnection, close } = await withServer(() => 'tok')
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=good' } })
    await expectRejected(ws)
    expect(onConnection).not.toHaveBeenCalled()
    close()
  })

  it('conn.close() closes the client socket', async () => {
    const { port, onConnection, close } = await withServer(() => 'tok')
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=good' }, origin: `http://127.0.0.1:${port}` })
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))
    const closed = new Promise<void>((resolve) => ws.on('close', () => resolve()))
    onConnection.mock.calls[0][0].close()
    await closed
    close()
  })
})

describe('isSameOriginUpgrade', () => {
  it('matches only the exact host and port', () => {
    expect(isSameOriginUpgrade('http://192.168.1.5:7842', '192.168.1.5:7842')).toBe(true)
    expect(isSameOriginUpgrade('http://192.168.1.5:7843', '192.168.1.5:7842')).toBe(false)
    expect(isSameOriginUpgrade('http://evil.example', '192.168.1.5:7842')).toBe(false)
    expect(isSameOriginUpgrade(undefined, '192.168.1.5:7842')).toBe(false)
    expect(isSameOriginUpgrade('not a url', '192.168.1.5:7842')).toBe(false)
  })
})
