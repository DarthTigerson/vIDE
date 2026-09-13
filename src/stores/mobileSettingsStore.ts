import { create } from 'zustand'

const ENABLED_KEY = 'vide:mobile:enabled'
const DEFAULT_MODE_KEY = 'vide:mobile:defaultMode'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

export type MobileDefaultMode = 'graph' | 'vide' | null

function getDefaultMode(): MobileDefaultMode {
  const value = localStorage.getItem(DEFAULT_MODE_KEY)
  return value === 'graph' || value === 'vide' ? value : null
}

interface MobileSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  // Which mode a paired phone lands on after pairing: 'graph' (usage
  // stats), 'vide' (the full editor), or null to show the chooser every
  // time. Pushed down to the running MobileServer via mobileSetDefaultMode
  // (see App.tsx) the same way theme/font are with mobileSetDisplay.
  defaultMode: MobileDefaultMode
  setDefaultMode: (mode: MobileDefaultMode) => void
}

export const useMobileSettingsStore = create<MobileSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },

  defaultMode: getDefaultMode(),

  setDefaultMode: (mode) => {
    if (mode === null) localStorage.removeItem(DEFAULT_MODE_KEY)
    else localStorage.setItem(DEFAULT_MODE_KEY, mode)
    set({ defaultMode: mode })
  },
}))
