import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../systemMemory', () => ({
  getSystemMemoryUsage: vi.fn(async () => ({
    usedBytes: 1000000000,
    totalBytes: 8000000000,
    percentUsed: 12.5,
  })),
}))

import { registerSystemRelayChannels } from '../channels/systemChannels'

describe('systemChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerSystemRelayChannels()
  })

  it('maps system:getMemoryUsage to getSystemMemoryUsage', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'system:getMemoryUsage', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: {
        usedBytes: 1000000000,
        totalBytes: 8000000000,
        percentUsed: 12.5,
      },
    })
  })
})
