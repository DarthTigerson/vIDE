import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

// Mocks the REAL bridge.ts module shape: BridgeManager's public
// send/approve/reject/cancel/testConnection methods (extracted from the
// ipcMain closures — not a fictional send(payload)/cancel() with no window),
// plus the disk-backed getBridgeSettings/setBridgeSettings functions
// (electron/main.ts's registerBridgeSettingsHandlers() delegates to the same
// two functions) rather than a fake per-connection in-memory Map.
vi.mock('../../bridge', () => ({
  getBridgeSettings: vi.fn(async () => ({ endpoint: 'http://saved', apiKey: 'saved-key', modelId: 'saved-model' })),
  setBridgeSettings: vi.fn(async () => undefined),
}))

import { registerBridgeRelayChannels } from '../channels/bridgeChannels'
import { getBridgeSettings, setBridgeSettings } from '../../bridge'
import type { BrowserWindow } from 'electron'

describe('bridgeChannels', () => {
  const fakeWin = { id: 7 } as BrowserWindow
  const bridgeManager = {
    send: vi.fn(async () => undefined),
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
    testConnection: vi.fn(async () => ({ ok: true })),
  }

  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerBridgeRelayChannels(bridgeManager as never, fakeWin)
  })

  it('maps bridge:send (send-type) to manager.send with the paired window and a bundled payload', async () => {
    const messages = [{ role: 'user' as const, content: 'hello' }]
    const settings = { endpoint: 'http://x', apiKey: 'k', modelId: 'm' }
    await dispatch({ type: 'send', method: 'bridge:send', args: ['/repo', messages, true, settings] })
    expect(bridgeManager.send).toHaveBeenCalledWith(fakeWin, { cwd: '/repo', messages, agentMode: true, settings })
  })

  it('maps bridge:approve (send-type) to manager.approve with the paired window', async () => {
    await dispatch({ type: 'send', method: 'bridge:approve', args: ['toolcall-1'] })
    expect(bridgeManager.approve).toHaveBeenCalledWith(fakeWin, 'toolcall-1')
  })

  it('maps bridge:reject (send-type) to manager.reject with the paired window', async () => {
    await dispatch({ type: 'send', method: 'bridge:reject', args: ['toolcall-1'] })
    expect(bridgeManager.reject).toHaveBeenCalledWith(fakeWin, 'toolcall-1')
  })

  it('maps bridge:cancel (send-type) to manager.cancel with the paired window', async () => {
    await dispatch({ type: 'send', method: 'bridge:cancel', args: [] })
    expect(bridgeManager.cancel).toHaveBeenCalledWith(fakeWin)
  })

  it('maps bridge:testConnection to manager.testConnection with the settings object as-is', async () => {
    const settings = { endpoint: 'http://localhost:1234', apiKey: 'key123', modelId: 'model-id' }
    const res = await dispatch({ type: 'invoke', id: '1', method: 'bridge:testConnection', args: [settings] })
    expect(res).toEqual({ type: 'response', id: '1', result: { ok: true } })
    expect(bridgeManager.testConnection).toHaveBeenCalledWith(settings)
  })

  it('maps bridge:getSettings/setSettings to the shared disk-backed settings functions', async () => {
    const res = await dispatch({ type: 'invoke', id: '2', method: 'bridge:getSettings', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: { endpoint: 'http://saved', apiKey: 'saved-key', modelId: 'saved-model' },
    })
    expect(getBridgeSettings).toHaveBeenCalled()

    const newSettings = { endpoint: 'http://new', apiKey: 'new-key', modelId: 'new-model' }
    await dispatch({ type: 'invoke', id: '3', method: 'bridge:setSettings', args: [newSettings] })
    expect(setBridgeSettings).toHaveBeenCalledWith(newSettings)
  })
})
