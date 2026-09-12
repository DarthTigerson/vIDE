import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import type { InboundMessage, OutboundMessage } from './protocol'

export interface RelayConnection {
  id: string
  send(msg: OutboundMessage): void
  onMessage(cb: (msg: InboundMessage) => void): void
  onClose(cb: () => void): void
}

export interface RelayServerOptions {
  isAuthenticated: (cookieHeader: string | undefined) => boolean
  onConnection: (conn: RelayConnection) => void
}

export interface RelayServer {
  close(): void
}

export function createRelayServer(httpServer: HttpServer, opts: RelayServerOptions): RelayServer {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    if (!opts.isAuthenticated(req.headers.cookie)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    const id = randomUUID()
    const messageCbs: Array<(msg: InboundMessage) => void> = []
    const closeCbs: Array<() => void> = []

    ws.on('message', (raw) => {
      let msg: InboundMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      for (const cb of messageCbs) cb(msg)
    })
    ws.on('close', () => {
      for (const cb of closeCbs) cb()
    })

    const conn: RelayConnection = {
      id,
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
      },
      onMessage: (cb) => messageCbs.push(cb),
      onClose: (cb) => closeCbs.push(cb),
    }
    opts.onConnection(conn)
  })

  return { close: () => wss.close() }
}
