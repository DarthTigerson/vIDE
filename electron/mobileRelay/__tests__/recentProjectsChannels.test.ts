import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../recentProjects', () => ({
  readRecents: vi.fn(async () => [{ path: '/project1', lastOpened: 123456 }]),
  addRecentProject: vi.fn(async (path: string) => undefined),
  clearRecentProjects: vi.fn(async () => undefined),
}))

import { registerRecentProjectsRelayChannels } from '../channels/recentProjectsChannels'

describe('recentProjectsChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerRecentProjectsRelayChannels()
  })

  it('maps recentProjects:list to readRecents', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'recentProjects:list', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: [{ path: '/project1', lastOpened: 123456 }],
    })
  })

  it('maps recentProjects:add to addRecentProject', async () => {
    const res = await dispatch({ type: 'invoke', id: '2', method: 'recentProjects:add', args: ['/project2'] })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: undefined,
    })
  })
})
