import { Server as HttpServer, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import type { InboundMessage, OutboundMessage } from './protocol'

export interface RelayConnection {
  id: string
  // The upgrade request's Cookie header, so the owner can re-check the
  // session on every message.
  cookieHeader: string | undefined
  close(): void
  send(msg: OutboundMessage): void
  onMessage(cb: (msg: InboundMessage) => void): void
  onClose(cb: () => void): void
}

export interface RelayServerOptions {
  // The session token the cookie header belongs to, or null if none.
  sessionFor: (cookieHeader: string | undefined) => string | null
  onConnection: (conn: RelayConnection, sessionToken: string) => void
}

// Browsers always send Origin on a WebSocket handshake. Only accept one whose
// host is the host the request was made to, i.e. the page vIDE served itself,
// so another site open on the phone can't open a socket to the relay.
export function isSameOriginUpgrade(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export interface RelayServer {
  close(): void
}

export function createRelayServer(httpServer: HttpServer, opts: RelayServerOptions): RelayServer {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const token = opts.sessionFor(req.headers.cookie)
    if (!token || !isSameOriginUpgrade(req.headers.origin, req.headers.host)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, token)
    })
  })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage, token: string) => {
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
      cookieHeader: req.headers.cookie,
      close: () => ws.close(),
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
      },
      onMessage: (cb) => messageCbs.push(cb),
      onClose: (cb) => closeCbs.push(cb),
    }
    opts.onConnection(conn, token)
  })

  return { close: () => wss.close() }
}
