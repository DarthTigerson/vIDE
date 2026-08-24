import { describe, it, expect, beforeEach } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})
import { vi } from 'vitest'

import { useAutocompleteSettingsStore, AUTOCOMPLETE_MODELS } from '../autocompleteSettingsStore'

describe('autocompleteSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    useAutocompleteSettingsStore.setState({ enabled: true, model: 'claude-haiku-4-5-20251001' })
  })

  it('defaults to enabled with Haiku 4.5 as the model', () => {
    expect(useAutocompleteSettingsStore.getState().enabled).toBe(true)
    expect(useAutocompleteSettingsStore.getState().model).toBe('claude-haiku-4-5-20251001')
  })

  it('lists Haiku 4.5, Sonnet 5, Opus 5, and Fable 5 as selectable models', () => {
    expect(AUTOCOMPLETE_MODELS.map((m) => m.id)).toEqual([
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5',
      'claude-opus-5',
      'claude-fable-5',
    ])
  })

  it('setEnabled persists to localStorage', () => {
    useAutocompleteSettingsStore.getState().setEnabled(false)
    expect(useAutocompleteSettingsStore.getState().enabled).toBe(false)
    expect(store['vide:autocomplete:enabled']).toBe('false')
  })

  it('setModel persists to localStorage', () => {
    useAutocompleteSettingsStore.getState().setModel('claude-opus-5')
    expect(useAutocompleteSettingsStore.getState().model).toBe('claude-opus-5')
    expect(store['vide:autocomplete:model']).toBe('claude-opus-5')
  })
})
