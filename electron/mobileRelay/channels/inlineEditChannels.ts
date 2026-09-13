import type { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { InlineEditManager, InlineEditStartPayload } from '../../inlineEdit'

// Inline-edit channels, mirroring the ipcMain wiring in
// electron/inlineEdit.ts's InlineEditManager.registerHandlers() — same
// channel names, same argument shape (inlineEdit:start takes a single
// InlineEditStartPayload object, not separate code/language args), same
// delegation to InlineEditManager's public start(win, payload) and
// cancel(win) methods (cancel is a thin wrapper extracted alongside start —
// see inlineEdit.ts — mirroring the ipcMain.on('inlineEdit:cancel', ...)
// closure body). The manager instance is the same one electron/main.ts
// constructs and disposes for the real desktop window (threaded through
// RelayChannelDeps), not a private instance owned by this file.
export function registerInlineEditRelayChannels(inlineEditManager: InlineEditManager, win: BrowserWindow): void {
  registerChannel('inlineEdit:start', (payload: InlineEditStartPayload) => inlineEditManager.start(win, payload))
  registerChannel('inlineEdit:cancel', () => inlineEditManager.cancel(win))
}
