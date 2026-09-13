import type { InboundMessage, OutboundMessage } from './protocol'

// `any[]` (not `unknown[]`) so individual channel registrations can declare
// concrete parameter types (e.g. `(cwd: string) => ...`) without a cast —
// under strictFunctionTypes, `unknown[]` params would reject any narrower
// handler signature at the call site.
export type ChannelHandler = (...args: any[]) => unknown

const channels = new Map<string, ChannelHandler>()

export function registerChannel(method: string, handler: ChannelHandler): void {
  channels.set(method, handler)
}

export function hasChannel(method: string): boolean {
  return channels.has(method)
}

export function allChannelNames(): string[] {
  return [...channels.keys()]
}

export function resetChannelsForTest(): void {
  channels.clear()
}

export async function dispatch(msg: InboundMessage): Promise<OutboundMessage | null> {
  const handler = channels.get(msg.method)
  if (msg.type === 'send') {
    if (handler) {
      try {
        await handler(...msg.args)
      } catch (err) {
        console.error(`[relay:send] error in handler for '${msg.method}':`, err instanceof Error ? err.message : String(err))
      }
    }
    return null
  }
  if (!handler) {
    return { type: 'response', id: msg.id, error: `Unknown method: ${msg.method}` }
  }
  try {
    const result = await handler(...msg.args)
    return { type: 'response', id: msg.id, result }
  } catch (err) {
    return { type: 'response', id: msg.id, error: err instanceof Error ? err.message : String(err) }
  }
}
