import type { RelayConnection } from './relayServer'

export interface Broadcaster {
  addConnection(conn: RelayConnection): void
  emit(event: string, ...args: unknown[]): void
}

export function createBroadcaster(): Broadcaster {
  const connections = new Set<RelayConnection>()
  return {
    addConnection(conn) {
      connections.add(conn)
      conn.onClose(() => connections.delete(conn))
    },
    emit(event, ...args) {
      for (const conn of connections) conn.send({ type: 'event', event, args })
    },
  }
}
