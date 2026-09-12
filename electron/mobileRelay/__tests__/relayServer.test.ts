import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'http'
import WebSocket from 'ws'
import { createRelayServer } from '../relayServer'

function withServer(isAuthenticated: (cookie: string | undefined) => boolean) {
  const httpServer = createServer()
  const onConnection = vi.fn()
  createRelayServer(httpServer, { isAuthenticated, onConnection })
  return new Promise<{ port: number; onConnection: typeof onConnection; close: () => void }>((resolve) => {
    httpServer.listen(0, () => {
      const address = httpServer.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ port, onConnection, close: () => httpServer.close() })
    })
  })
}

describe('createRelayServer auth gate', () => {
  it('rejects a connection without a valid session cookie', async () => {
    const { port, onConnection, close } = await withServer(() => false)
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=bad' } })
    // A rejected handshake always emits 'error' on the ws client before 'close';
    // without a listener Node throws on the unhandled 'error' event.
    ws.on('error', () => {})
    await new Promise<void>((resolve) => ws.on('close', () => resolve()))
    expect(onConnection).not.toHaveBeenCalled()
    close()
  })

  it('accepts a connection with a valid session cookie', async () => {
    const { port, onConnection, close } = await withServer(() => true)
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie: 'session=good' } })
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))
    expect(onConnection).toHaveBeenCalledTimes(1)
    ws.close()
    close()
  })
})
