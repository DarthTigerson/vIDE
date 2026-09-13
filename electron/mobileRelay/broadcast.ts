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
      for (const conn of connections) {
        try {
          conn.send({ type: 'event', event, args })
        } catch (err) {
          console.error(
            `[relay:broadcast] error sending '${event}' to connection '${conn.id}':`,
            err instanceof Error ? err.message : String(err)
          )
        }
      }
    },
  }
}
