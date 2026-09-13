import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../usageManager', () => ({
  UsageManager: vi.fn().mockImplementation(() => ({
    acquire: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    getLatest: vi.fn(async () => ({ timestamp: 123, cpu: 50, memory: 1000000000 })),
    getRange: vi.fn(async (fromTs: number, toTs: number, maxPoints?: number) =>
      [{ timestamp: 123, cpu: 50, memory: 1000000000 }]),
    getPassiveEnabled: vi.fn(async () => true),
    setPassiveEnabled: vi.fn(async () => undefined),
  })),
}))

import { registerUsageRelayChannels } from '../channels/usageChannels'

describe('usageChannels', () => {
  let mockUsageManager: any

  beforeEach(() => {
    resetChannelsForTest()
    mockUsageManager = {
      acquire: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
      getLatest: vi.fn(async () => ({ timestamp: 123, cpu: 50, memory: 1000000000 })),
      getRange: vi.fn(async (fromTs: number, toTs: number, maxPoints?: number) =>
        [{ timestamp: 123, cpu: 50, memory: 1000000000 }]),
      getPassiveEnabled: vi.fn(async () => true),
      setPassiveEnabled: vi.fn(async () => undefined),
    }
    registerUsageRelayChannels(mockUsageManager)
  })

  it('maps usage:getLatest to manager.getLatest', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'usage:getLatest', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: { timestamp: 123, cpu: 50, memory: 1000000000 },
    })
    expect(mockUsageManager.getLatest).toHaveBeenCalled()
  })

  it('maps usage:getRange with 3 args in order', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'usage:getRange',
      args: [100, 200, 50]
    })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: [{ timestamp: 123, cpu: 50, memory: 1000000000 }],
    })
    expect(mockUsageManager.getRange).toHaveBeenCalledWith(100, 200, 50)
  })

  it('maps usage:setPassiveEnabled to manager.setPassiveEnabled', async () => {
    const res = await dispatch({ type: 'invoke', id: '3', method: 'usage:setPassiveEnabled', args: [false] })
    expect(res).toEqual({
      type: 'response',
      id: '3',
      result: undefined,
    })
    expect(mockUsageManager.setPassiveEnabled).toHaveBeenCalledWith(false)
  })
})
