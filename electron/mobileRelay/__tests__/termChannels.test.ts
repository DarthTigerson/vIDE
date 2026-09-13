import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'
import { registerTermRelayChannels } from '../channels/termChannels'

describe('termChannels', () => {
  const fakeWin = { id: 1 } as never
  const ptyManager = { spawn: vi.fn(), kill: vi.fn(), write: vi.fn(), resize: vi.fn() }

  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerTermRelayChannels(ptyManager as never, fakeWin)
  })

  it('maps term:spawn to ptyManager.spawn with the paired window', async () => {
    await dispatch({ type: 'invoke', id: '1', method: 'term:spawn', args: ['t1', '/repo'] })
    expect(ptyManager.spawn).toHaveBeenCalledWith(fakeWin, 't1', '/repo')
  })

  it('maps term:kill to ptyManager.kill with the paired window', async () => {
    await dispatch({ type: 'invoke', id: '2', method: 'term:kill', args: ['t1'] })
    expect(ptyManager.kill).toHaveBeenCalledWith(fakeWin, 't1')
  })

  it('maps term:write (send-type) to ptyManager.write', async () => {
    await dispatch({ type: 'send', method: 'term:write', args: ['t1', 'ls\n'] })
    expect(ptyManager.write).toHaveBeenCalledWith(fakeWin, 't1', 'ls\n')
  })

  it('maps term:resize (send-type) to ptyManager.resize', async () => {
    await dispatch({ type: 'send', method: 'term:resize', args: ['t1', 80, 24] })
    expect(ptyManager.resize).toHaveBeenCalledWith(fakeWin, 't1', 80, 24)
  })
})
