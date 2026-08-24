import { create } from 'zustand'

const KEYS = {
  enabled: 'vide:commitMessage:enabled',
  model: 'vide:commitMessage:model',
  prompt: 'vide:commitMessage:prompt',
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

interface CommitMessageSettingsStore {
  enabled: boolean
  model: string
  prompt: string
  setEnabled: (value: boolean) => void
  setModel: (value: string) => void
  setPrompt: (value: string) => void
}

export const useCommitMessageSettingsStore = create<CommitMessageSettingsStore>((set) => ({
  enabled: getBool(KEYS.enabled, true),
  model: getString(KEYS.model, DEFAULT_MODEL),
  prompt: getString(KEYS.prompt, ''),

  setEnabled: (value) => {
    try { localStorage.setItem(KEYS.enabled, String(value)) } catch {}
    set({ enabled: value })
  },
  setModel: (value) => {
    try { localStorage.setItem(KEYS.model, value) } catch {}
    set({ model: value })
  },
  setPrompt: (value) => {
    try { localStorage.setItem(KEYS.prompt, value) } catch {}
    set({ prompt: value })
  },
}))
