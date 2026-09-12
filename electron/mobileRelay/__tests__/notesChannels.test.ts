import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/fake/userData'),
  },
  BrowserWindow: vi.fn(),
}))

import { registerNotesRelayChannels } from '../channels/notesChannels'

describe('notesChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerNotesRelayChannels()
  })

  it('routes notes channels through dispatch', async () => {
    // Test that channels are registered; actual file ops fail since paths don't exist
    const res = await dispatch({ type: 'invoke', id: '1', method: 'notes:getRoot', args: [] })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('1')
  })

  it('routes notes:search with query argument', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'notes:search',
      args: ['test query']
    })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('2')
  })
})
