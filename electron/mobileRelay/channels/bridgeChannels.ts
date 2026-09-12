import { registerChannel } from '../dispatch'
import type { BridgeManager } from '../../bridge'
import type { BridgeSendPayload } from '../../bridge'

// Bridge settings management - stored per-connection for the relay
const bridgeSettingsByConn = new Map<string, { endpoint: string; apiKey: string; modelId: string }>()

// Bridge channels require the BridgeManager instance for send/approve/reject/cancel methods.
export function registerBridgeRelayChannels(bridgeManager: BridgeManager, connId?: string): void {
  const cId = connId || 'default'

  // Fire-and-forget send-style channels
  registerChannel('bridge:send', (payload: BridgeSendPayload) => bridgeManager.send(payload))
  registerChannel('bridge:approve', (toolCallId: string) => bridgeManager.approve(toolCallId))
  registerChannel('bridge:reject', (toolCallId: string) => bridgeManager.reject(toolCallId))
  registerChannel('bridge:cancel', () => bridgeManager.cancel())

  // Request/response invoke-style channels
  registerChannel('bridge:testConnection', (endpoint: string, apiKey: string, modelId: string) =>
    bridgeManager.testConnection({ endpoint, apiKey, modelId }))

  // Settings management — per-connection storage for bridge configuration
  registerChannel('bridge:getSettings', () => bridgeSettingsByConn.get(cId))
  registerChannel('bridge:setSettings', (settings: { endpoint: string; apiKey: string; modelId: string }) => {
    bridgeSettingsByConn.set(cId, settings)
  })
}
