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
