import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../changelog', () => ({
  getChangelogForVersion: vi.fn(async (version: string) => `Changes for ${version}`),
}))

import { registerChangelogRelayChannels } from '../channels/changelogChannels'

describe('changelogChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerChangelogRelayChannels()
  })

  it('maps changelog:getForVersion to getChangelogForVersion', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'changelog:getForVersion', args: ['1.0.0'] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: 'Changes for 1.0.0',
    })
  })
})
