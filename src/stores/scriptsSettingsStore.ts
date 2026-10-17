import { create } from 'zustand'
import { notifySettingChanged } from '@/lib/notifySettingChanged'

// Under vide:scripts:, so vIDE Sync carries it with the scripts category.
const ENABLED_KEY = 'vide:scripts:enabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface ScriptsSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

export const useScriptsSettingsStore = create<ScriptsSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),
  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
    notifySettingChanged()
  },
}))
