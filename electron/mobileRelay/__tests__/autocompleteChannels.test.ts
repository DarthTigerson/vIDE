import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'
import { registerAutocompleteRelayChannels } from '../channels/autocompleteChannels'
import type { BrowserWindow } from 'electron'

// Mocks the REAL AutocompleteManager shape (electron/autocomplete/manager.ts):
// a public complete(windowId, prefix, suffix) method.
describe('autocompleteChannels', () => {
  const fakeWin = { id: 42 } as BrowserWindow
  const autocompleteManager = {
    complete: vi.fn(async (_windowId: number, _prefix: string, _suffix: string): Promise<string | null> => 'const x = 1'),
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
      args: ['const x =', ';\n'],
    })
    expect(res).toEqual({ type: 'response', id: '1', result: 'const x = 1' })
    expect(autocompleteManager.complete).toHaveBeenCalledWith(42, 'const x =', ';\n')
  })

  it('propagates a null completion result', async () => {
    autocompleteManager.complete.mockResolvedValueOnce(null)
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'autocomplete:complete',
      args: ['', ''],
    })
    expect(res).toEqual({ type: 'response', id: '2', result: null })
  })
})
