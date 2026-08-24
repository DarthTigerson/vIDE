import { create } from 'zustand'

const KEYS = {
  enabled: 'vide:autocomplete:enabled',
  model: 'vide:autocomplete:model',
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export const AUTOCOMPLETE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-fable-5', label: 'Fable 5' },
]

function getBool(key: string, def: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? def : value === 'true'
  } catch {
    return def
  }
}

function getString(key: string, def: string): string {
  try {
    return localStorage.getItem(key) ?? def
  } catch {
    return def
  }
}

interface AutocompleteSettingsStore {
  enabled: boolean
  model: string
  setEnabled: (value: boolean) => void
  setModel: (value: string) => void
}

export const useAutocompleteSettingsStore = create<AutocompleteSettingsStore>((set) => ({
  enabled: getBool(KEYS.enabled, true),
  model: getString(KEYS.model, DEFAULT_MODEL),

  setEnabled: (value) => {
    try { localStorage.setItem(KEYS.enabled, String(value)) } catch {}
    set({ enabled: value })
  },
  setModel: (value) => {
    try { localStorage.setItem(KEYS.model, value) } catch {}
    set({ model: value })
  },
}))
