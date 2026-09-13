import { create } from 'zustand'

const ENABLED_KEY = 'vide:llama:enabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface LlamaSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

export const useLlamaSettingsStore = create<LlamaSettingsStore>((set) => ({
  // On by default so the panel is discoverable; the icon and panel are
  // otherwise empty until llama controls land.
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },
}))
