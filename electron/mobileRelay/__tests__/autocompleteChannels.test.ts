import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../autocomplete', () => ({
  AutocompleteManager: vi.fn().mockImplementation(() => ({
    complete: vi.fn(async (prompt: string, maxTokens?: number) => ({
      completion: 'completed text',
      tokens: maxTokens || 512,
    })),
  })),
}))

import { registerAutocompleteRelayChannels } from '../channels/autocompleteChannels'

describe('autocompleteChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    const fakeWin = {} as any
    registerAutocompleteRelayChannels(fakeWin)
  })

  it('maps autocomplete:complete with prompt and optional maxTokens', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '1',
      method: 'autocomplete:complete',
      args: ['function add(a, b) {', 256]
    })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('1')
    expect(res.result).toHaveProperty('completion')
  })

  it('maps autocomplete:complete with prompt only', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'autocomplete:complete',
      args: ['console.log(']
    })
    expect(res.type).toEqual('response')
    expect(res.id).toEqual('2')
    expect(res.result).toHaveProperty('completion')
  })
})
