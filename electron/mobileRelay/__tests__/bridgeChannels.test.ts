import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../bridge', () => ({
  BridgeManager: vi.fn().mockImplementation(() => ({
    send: vi.fn(async () => undefined),
    approve: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    testConnection: vi.fn(async (settings) => ({ ok: true, message: 'Connected' })),
  })),
}))

import { registerBridgeRelayChannels } from '../channels/bridgeChannels'

describe('bridgeChannels', () => {
  let mockBridgeManager: any

  beforeEach(() => {
    resetChannelsForTest()
    mockBridgeManager = {
      send: vi.fn(async () => undefined),
      approve: vi.fn(async () => undefined),
      reject: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      testConnection: vi.fn(async (settings) => ({ ok: true, message: 'Connected' })),
    }
    registerBridgeRelayChannels(mockBridgeManager)
  })

  it('maps bridge:send to manager.send with payload', async () => {
    const payload = { role: 'user' as const, content: 'hello' }
    const res = await dispatch({
      type: 'invoke',
      id: '1',
      method: 'bridge:send',
      args: [payload]
    })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: undefined,
    })
    expect(mockBridgeManager.send).toHaveBeenCalledWith(payload)
  })

  it('maps bridge:testConnection with 3 args in order', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'bridge:testConnection',
      args: ['http://localhost:1234', 'key123', 'model-id']
    })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: { ok: true, message: 'Connected' },
    })
    expect(mockBridgeManager.testConnection).toHaveBeenCalledWith({
      endpoint: 'http://localhost:1234',
      apiKey: 'key123',
      modelId: 'model-id',
    })
  })

  it('maps bridge:approve to manager.approve', async () => {
    const res = await dispatch({ type: 'invoke', id: '3', method: 'bridge:approve', args: ['toolcall-1'] })
    expect(res).toEqual({
      type: 'response',
      id: '3',
      result: undefined,
    })
    expect(mockBridgeManager.approve).toHaveBeenCalledWith('toolcall-1')
  })
})
