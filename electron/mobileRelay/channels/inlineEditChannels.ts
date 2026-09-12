import { registerChannel } from '../dispatch'
import { InlineEditManager } from '../../inlineEdit'
import type { BrowserWindow } from 'electron'

// Inline edit requires an InlineEditManager instance for Monaco editor integration.
// We create and maintain a single manager for the relay to handle mobile client requests.
let inlineEditManager: InlineEditManager | null = null

function ensureManager(win: BrowserWindow): InlineEditManager {
  if (!inlineEditManager) {
    inlineEditManager = new InlineEditManager()
  }
  return inlineEditManager
}

export function registerInlineEditRelayChannels(win: BrowserWindow): void {
  const manager = ensureManager(win)
  registerChannel('inlineEdit:start', (code: string, language: string) =>
    manager.start(code, language))
  registerChannel('inlineEdit:cancel', () => manager.cancel())
}
