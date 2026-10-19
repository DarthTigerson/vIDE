import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'

// Ghost text only while autocomplete is turned on, its model is running, and
// the user hasn't snoozed it from the footer.
export function isAutocompleteEffectivelyEnabled(): boolean {
  const runtime = useAutocompleteRuntimeStore.getState()
  return useAutocompleteSettingsStore.getState().enabled
    && runtime.state.phase === 'running'
    && !runtime.isSnoozed()
}
