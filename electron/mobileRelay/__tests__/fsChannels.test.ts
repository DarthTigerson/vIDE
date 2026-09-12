import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../fsOps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../fsOps')>()),
  listAllFiles: vi.fn(async (root: string) => [`${root}/a.ts`]),
}))

import { registerFsRelayChannels } from '../channels/fsChannels'

describe('fsChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerFsRelayChannels()
  })

  it('maps fs:listAllFiles to listAllFiles', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'fs:listAllFiles', args: ['/root'] })
    expect(res).toEqual({ type: 'response', id: '1', result: ['/root/a.ts'] })
  })
})
