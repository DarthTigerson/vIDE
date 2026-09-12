import type { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { AutocompleteManager } from '../../autocomplete'

// Autocomplete channel, mirroring the ipcMain wiring in
// electron/autocomplete.ts's AutocompleteManager.registerHandlers() — same
// channel name, same argument order, same delegation to
// AutocompleteManager's public complete(windowId, prefix, suffix, language,
// model) method. The manager instance is the same one electron/main.ts
// constructs and disposes for the real desktop window (threaded through
// RelayChannelDeps), not a private instance owned by this file — so mobile
// completions share the app's single Claude-CLI-path cache and get disposed
// on Mobile Display stop, instead of leaking a second, never-cleaned-up
// child process. As with termChannels/claudeChannels, every
// mobile-originated request is bound to the single paired window's id
// rather than resolved per-call from event.sender.
export function registerAutocompleteRelayChannels(autocompleteManager: AutocompleteManager, win: BrowserWindow): void {
  registerChannel('autocomplete:complete', (prefix: string, suffix: string, language: string, model: string) =>
    autocompleteManager.complete(win.id, prefix, suffix, language, model))
}
