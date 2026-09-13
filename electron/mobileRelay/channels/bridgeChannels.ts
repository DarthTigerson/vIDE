import type { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { BridgeManager, BridgeMessage, BridgeSettings } from '../../bridge'
import { getBridgeSettings, setBridgeSettings } from '../../bridge'
import type { BridgeStoredSettings } from '../../bridge'

// Bridge channels, mirroring the ipcMain wiring in electron/bridge.ts's
// BridgeManager.registerHandlers() — same channel names, same argument
// order, same delegation to BridgeManager's public send/approve/reject/
// cancel/testConnection methods (extracted from those ipcMain closures so
// this relay and the real desktop window share identical logic). As with
// termChannels/claudeChannels, every mobile-originated Bridge conversation
// is bound to the single paired window supplied by MobileServer rather than
// resolved per-call from event.sender — BridgeManager already keys its
// per-conversation state by win.id internally.
//
// bridge:getSettings/setSettings delegate to the same disk-backed
// bridge-settings.json (under userData) that electron/main.ts's
// registerBridgeSettingsHandlers() uses for the desktop window, so a paired
// phone sees the same configured endpoint/API key/model rather than its own
// throwaway in-memory copy.
export function registerBridgeRelayChannels(bridgeManager: BridgeManager, win: BrowserWindow): void {
  // window.api.bridgeSend's renderer-facing signature is 4 separate args
  // (src/types/api.d.ts) — electron/preload.ts happens to bundle them into
  // one payload object before handing off to ipcRenderer.send, but the
  // mobile shim (src/lib/mobileApiShim) forwards whatever args the caller
  // passed, unbundled, so this channel receives the same 4 args and does
  // that bundling itself, matching BridgeSendPayload.
  registerChannel('bridge:send', (cwd: string, messages: BridgeMessage[], agentMode: boolean, settings: BridgeSettings) =>
    bridgeManager.send(win, { cwd, messages, agentMode, settings }))
  registerChannel('bridge:approve', (toolCallId: string) => bridgeManager.approve(win, toolCallId))
  registerChannel('bridge:reject', (toolCallId: string) => bridgeManager.reject(win, toolCallId))
  registerChannel('bridge:cancel', () => bridgeManager.cancel(win))

  registerChannel('bridge:testConnection', (settings: BridgeSettings) => bridgeManager.testConnection(settings))

  registerChannel('bridge:getSettings', () => getBridgeSettings())
  registerChannel('bridge:setSettings', (settings: BridgeStoredSettings) => setBridgeSettings(settings))
}
