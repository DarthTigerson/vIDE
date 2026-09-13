import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'
import { registerCommitMessageRelayChannels } from '../channels/commitMessageChannels'
import type { BrowserWindow } from 'electron'

// Mocks the REAL CommitMessageManager shape (electron/commitMessage.ts): a
// public generate(windowId, diff, model, customPrompt) method — not a
// fictional generate() called with no window/id at all.
describe('commitMessageChannels', () => {
  const fakeWin = { id: 99 } as BrowserWindow
  const commitMessageManager = {
    generate: vi.fn(async (_windowId: number, _diff: string, _model: string, _customPrompt: string) => 'Fixed the bug'),
  }

  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerCommitMessageRelayChannels(commitMessageManager as never, fakeWin)
  })

  it('maps commitMessage:generate to manager.generate with the paired window id and args in order', async () => {
    const diff = '@@ -1,3 +1,3 @@ function add(a, b) { return a + b; }'
    const res = await dispatch({
      type: 'invoke',
      id: '1',
      method: 'commitMessage:generate',
      args: [diff, 'claude-3-5-sonnet', 'Keep it short'],
    })
    expect(res).toEqual({ type: 'response', id: '1', result: 'Fixed the bug' })
    expect(commitMessageManager.generate).toHaveBeenCalledWith(99, diff, 'claude-3-5-sonnet', 'Keep it short')
  })
})
