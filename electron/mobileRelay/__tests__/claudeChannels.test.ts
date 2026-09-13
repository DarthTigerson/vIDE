import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'
import { registerClaudeRelayChannels } from '../channels/claudeChannels'

describe('claudeChannels', () => {
  const fakeWin = { id: 1 } as never
  const claudeManager = { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() }

  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerClaudeRelayChannels(claudeManager as never, fakeWin)
  })

  it('maps claude:spawn to claudeManager.spawn with the paired window', async () => {
    await dispatch({ type: 'invoke', id: '1', method: 'claude:spawn', args: ['/repo', 'claude', 'resume'] })
    expect(claudeManager.spawn).toHaveBeenCalledWith(fakeWin, '/repo', 'claude', 'resume')
  })

  it('maps claude:write (send-type) to claudeManager.write', async () => {
    await dispatch({ type: 'send', method: 'claude:write', args: ['claude', 'ls\n'] })
    expect(claudeManager.write).toHaveBeenCalledWith(fakeWin, 'claude', 'ls\n')
  })

  it('maps claude:resize (send-type) to claudeManager.resize', async () => {
    await dispatch({ type: 'send', method: 'claude:resize', args: ['claude', 80, 24] })
    expect(claudeManager.resize).toHaveBeenCalledWith(fakeWin, 'claude', 80, 24)
  })

  it('maps claude:kill (send-type) to claudeManager.kill', async () => {
    await dispatch({ type: 'send', method: 'claude:kill', args: ['claude'] })
    expect(claudeManager.kill).toHaveBeenCalledWith(fakeWin, 'claude')
  })
})
