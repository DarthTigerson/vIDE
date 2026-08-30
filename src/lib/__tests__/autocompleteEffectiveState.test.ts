import { describe, it, expect, beforeEach } from 'vitest'
import { isAutocompleteEffectivelyEnabled } from '../autocompleteEffectiveState'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteSessionStore } from '@/stores/autocompleteSessionStore'

describe('isAutocompleteEffectivelyEnabled', () => {
  beforeEach(() => {
    useAutocompleteSettingsStore.setState({ enabled: true })
    useAutocompleteSessionStore.setState({ paused: false })
  })

  it('is force-disabled regardless of the persisted setting (VIDE-16)', () => {
    expect(isAutocompleteEffectivelyEnabled()).toBe(false)
  })

  it('stays false even for a pre-existing user whose setting was already enabled', () => {
    useAutocompleteSettingsStore.setState({ enabled: true })
    useAutocompleteSessionStore.setState({ paused: false })
    expect(isAutocompleteEffectivelyEnabled()).toBe(false)
  })

  it('stays false when disabled in settings', () => {
    useAutocompleteSettingsStore.setState({ enabled: false })
    expect(isAutocompleteEffectivelyEnabled()).toBe(false)
  })
})
