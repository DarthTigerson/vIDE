import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../commitMessage', () => ({
  CommitMessageManager: vi.fn().mockImplementation(() => ({
    generate: vi.fn(async (windowId: number, diff: string, model: string, customPrompt: string) => ({
      message: 'fix: updated component logic',
      confidence: 0.95,
    })),
  })),
}))

import { registerCommitMessageRelayChannels } from '../channels/commitMessageChannels'

describe('commitMessageChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    const fakeWin = {} as any
    registerCommitMessageRelayChannels(fakeWin)
  })

  it('maps commitMessage:generate with diff, model, and customPrompt args', async () => {
    const diff = '@@ -1,3 +1,3 @@ function add(a, b) { return a + b; }'
    const res = await dispatch({
      type: 'invoke',
      id: '1',
      method: 'commitMessage:generate',
      args: [diff, 'claude-3-sonnet', 'Keep it short']
    })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('1')
    expect(res.result).toHaveProperty('message')
  })
})
