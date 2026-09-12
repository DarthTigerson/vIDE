import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../inlineEdit', () => ({
  InlineEditManager: vi.fn().mockImplementation(() => ({
    start: vi.fn(async (code: string, language: string) => ({
      sessionId: 'session-123',
      code,
      language,
    })),
    cancel: vi.fn(async () => ({ cancelled: true })),
  })),
}))

import { registerInlineEditRelayChannels } from '../channels/inlineEditChannels'

describe('inlineEditChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    const fakeWin = {} as any
    registerInlineEditRelayChannels(fakeWin)
  })

  it('maps inlineEdit:start with code and language args', async () => {
    const code = 'function add(a, b) { return a + b; }'
    const res = await dispatch({
      type: 'invoke',
      id: '1',
      method: 'inlineEdit:start',
      args: [code, 'typescript']
    })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('1')
    expect(res.result).toHaveProperty('sessionId')
    expect(res.result?.code).toEqual(code)
    expect(res.result?.language).toEqual('typescript')
  })

  it('maps inlineEdit:cancel with no args', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'inlineEdit:cancel',
      args: []
    })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('2')
    expect(res.result).toHaveProperty('cancelled')
  })
})
