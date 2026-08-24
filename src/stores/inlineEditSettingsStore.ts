import { create } from 'zustand'

const KEYS = {
  enabled: 'vide:inlineEdit:enabled',
  model: 'vide:inlineEdit:model',
}

const DEFAULT_MODEL = 'claude-sonnet-5'

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

interface InlineEditSettingsStore {
  enabled: boolean
  model: string
  setEnabled: (value: boolean) => void
  setModel: (value: string) => void
}

export const useInlineEditSettingsStore = create<InlineEditSettingsStore>((set) => ({
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
