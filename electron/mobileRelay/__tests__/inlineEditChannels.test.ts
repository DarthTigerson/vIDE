import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'
import { registerInlineEditRelayChannels } from '../channels/inlineEditChannels'
import type { BrowserWindow } from 'electron'
import type { InlineEditStartPayload } from '../../inlineEdit'

// Mocks the REAL InlineEditManager shape (electron/inlineEdit.ts): a public
// start(win, payload) method (a single InlineEditStartPayload object, not
// separate code/language args) and a public cancel(win) wrapper around the
// private cancelWindow(win.id) — not a fictional start(code, language) /
// cancel() with no window at all.
describe('inlineEditChannels', () => {
  const fakeWin = { id: 7 } as BrowserWindow
  const inlineEditManager = {
    start: vi.fn(async (_win: BrowserWindow, _payload: InlineEditStartPayload) => undefined),
    cancel: vi.fn((_win: BrowserWindow) => undefined),
  }

  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerInlineEditRelayChannels(inlineEditManager as never, fakeWin)
  })

  it('maps inlineEdit:start (send-type) to manager.start with the paired window and the payload', async () => {
    const payload: InlineEditStartPayload = {
      requestId: 'req-1',
      prefix: 'function add(a, b) {',
      suffix: '}',
      selection: '',
      instruction: 'return the sum',
      language: 'typescript',
      model: 'claude-3-5-sonnet',
    }
    await dispatch({ type: 'send', method: 'inlineEdit:start', args: [payload] })
    expect(inlineEditManager.start).toHaveBeenCalledWith(fakeWin, payload)
  })

  it('maps inlineEdit:cancel (send-type) to manager.cancel with the paired window', async () => {
    await dispatch({ type: 'send', method: 'inlineEdit:cancel', args: [] })
    expect(inlineEditManager.cancel).toHaveBeenCalledWith(fakeWin)
  })
})
