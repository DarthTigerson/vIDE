import { create } from 'zustand'

const ENABLED_KEY = 'vide:graphify:enabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface GraphifySettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

export const useGraphifySettingsStore = create<GraphifySettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },
}))
