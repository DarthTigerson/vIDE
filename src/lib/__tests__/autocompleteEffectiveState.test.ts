import { describe, it, expect, beforeEach } from 'vitest'
import { isAutocompleteEffectivelyEnabled } from '../autocompleteEffectiveState'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'

const runtime = useAutocompleteRuntimeStore.getState()

function setPhase(phase: typeof runtime.state.phase) {
  useAutocompleteRuntimeStore.setState({ state: { ...runtime.state, phase }, snoozedUntil: null })
}

describe('isAutocompleteEffectivelyEnabled', () => {
  beforeEach(() => {
    useAutocompleteSettingsStore.setState({ enabled: true })
    setPhase('running')
  })

  it('is on when enabled and the model is running', () => {
    expect(isAutocompleteEffectivelyEnabled()).toBe(true)
  })

  it('is off when the setting is off', () => {
    useAutocompleteSettingsStore.setState({ enabled: false })
    expect(isAutocompleteEffectivelyEnabled()).toBe(false)
  })

  it('is off while the model is not running', () => {
    setPhase('starting')
    expect(isAutocompleteEffectivelyEnabled()).toBe(false)
  })

  it('is off while snoozed', () => {
    useAutocompleteRuntimeStore.setState({ snoozedUntil: 'resume' })
    expect(isAutocompleteEffectivelyEnabled()).toBe(false)
  })
})
