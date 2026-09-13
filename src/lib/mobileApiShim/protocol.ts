// Duplicated from electron/mobileRelay/protocol.ts. Not shared across the
// electron/ and src/ tsconfig boundary (tsconfig.node.json vs
// tsconfig.web.json have different lib/module settings and electron/ isn't
// on the renderer's include list) — keep both copies in sync by hand if the
// wire protocol ever changes.
export interface InvokeRequest {
  type: 'invoke'
  id: string
  method: string
  args: unknown[]
}

export interface InvokeResponse {
  type: 'response'
  id: string
  result?: unknown
  error?: string
}

export interface SendMessage {
  type: 'send'
  method: string
  args: unknown[]
}

export interface PushEvent {
  type: 'event'
  event: string
  args: unknown[]
}

export type InboundMessage = InvokeRequest | SendMessage
export type OutboundMessage = InvokeResponse | PushEvent
