import type { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { AutocompleteManager, AutocompleteRequest } from '../../autocomplete/manager'

// Autocomplete channel, mirroring the ipcMain wiring in
// electron/autocomplete/manager.ts's AutocompleteManager.registerHandlers() —
// same channel name, same argument order, same delegation to
// AutocompleteManager's public complete(windowId, request) method. The
// manager instance is the same one electron/main.ts constructs (threaded
// through RelayChannelDeps), so mobile completions use the app's one
// autocomplete server and get their in-flight request aborted on Mobile
// Display stop. As with termChannels/claudeChannels, every
// mobile-originated request is bound to the single paired window's id
// rather than resolved per-call from event.sender.
export function registerAutocompleteRelayChannels(autocompleteManager: AutocompleteManager, win: BrowserWindow): void {
  registerChannel('autocomplete:complete', (req: AutocompleteRequest) =>
    autocompleteManager.complete(win.id, req))
}
