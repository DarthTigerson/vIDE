import { registerChannel } from '../dispatch'
import { AutocompleteManager } from '../../autocomplete'
import type { BrowserWindow } from 'electron'

// Autocomplete requires an AutocompleteManager instance for managing Claude process state.
// Unlike generic exported functions, autocomplete:complete needs per-window process management,
// but we can instantiate one manager for the relay and reuse it across all mobile connections.
let autocompleteManager: AutocompleteManager | null = null

function ensureManager(win: BrowserWindow): AutocompleteManager {
  if (!autocompleteManager) {
    autocompleteManager = new AutocompleteManager()
  }
  return autocompleteManager
}

export function registerAutocompleteRelayChannels(win: BrowserWindow): void {
  const manager = ensureManager(win)
  registerChannel('autocomplete:complete', (prompt: string, maxTokens?: number) =>
    manager.complete(prompt, maxTokens))
}
