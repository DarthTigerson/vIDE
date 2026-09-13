import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'
import { registerAutocompleteRelayChannels } from '../channels/autocompleteChannels'
import type { BrowserWindow } from 'electron'

// Mocks the REAL AutocompleteManager shape (electron/autocomplete.ts): a
// public complete(windowId, prefix, suffix, language, model) method — not a
// fictional complete(prompt, maxTokens) convenience API.
describe('autocompleteChannels', () => {
  const fakeWin = { id: 42 } as BrowserWindow
  const autocompleteManager = {
    complete: vi.fn(async (_windowId: number, _prefix: string, _suffix: string, _language: string, _model: string): Promise<string | null> => 'const x = 1'),
  }

  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerAutocompleteRelayChannels(autocompleteManager as never, fakeWin)
  })

  it('maps autocomplete:complete to manager.complete with the paired window id and args in order', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '1',
      method: 'autocomplete:complete',
      args: ['const x =', ';\n', 'typescript', 'claude-3-5-sonnet'],
    })
    expect(res).toEqual({ type: 'response', id: '1', result: 'const x = 1' })
    expect(autocompleteManager.complete).toHaveBeenCalledWith(42, 'const x =', ';\n', 'typescript', 'claude-3-5-sonnet')
  })

  it('propagates a null completion result', async () => {
    autocompleteManager.complete.mockResolvedValueOnce(null)
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'autocomplete:complete',
      args: ['', '', 'typescript', 'claude-3-5-sonnet'],
    })
    expect(res).toEqual({ type: 'response', id: '2', result: null })
  })
})
