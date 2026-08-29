import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteSessionStore } from '@/stores/autocompleteSessionStore'

// Autocomplete is temporarily force-disabled while its architecture is
// reworked (VIDE-16) — the current per-keystroke Claude-CLI-subprocess
// design burns subscription usage and has poor latency. This overrides
// any previously-persisted enabled setting, including for existing users
// who already had it toggled on. Flip this back to false once the rework
// ships. UI that shows/hides autocomplete affordances (e.g. the StatusBar
// icon) should also key off this flag, not just the raw settings store.
export const AUTOCOMPLETE_FORCE_DISABLED = true

export function isAutocompleteEffectivelyEnabled(): boolean {
  if (AUTOCOMPLETE_FORCE_DISABLED) return false
  return useAutocompleteSettingsStore.getState().enabled && !useAutocompleteSessionStore.getState().paused
}
