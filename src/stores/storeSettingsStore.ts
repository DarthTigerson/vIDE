import { create } from 'zustand'

// Whether the Store page and palette offer "Install from file…". Off by
// default. Not in any vIDE Sync category (no CATEGORY_PREFIXES entry matches
// 'vide:store:'), so it stays per machine and needs no notifySettingChanged.
export const INSTALL_FROM_FILE_KEY = 'vide:store:installFromFile'

function read(): boolean {
  try {
    return localStorage.getItem(INSTALL_FROM_FILE_KEY) === 'true'
  } catch {
    return false
  }
}

interface StoreSettingsStore {
  installFromFile: boolean
  setInstallFromFile: (value: boolean) => void
}

export const useStoreSettingsStore = create<StoreSettingsStore>((set) => ({
  installFromFile: read(),
  setInstallFromFile: (value) => {
    try { localStorage.setItem(INSTALL_FROM_FILE_KEY, String(value)) } catch { /* storage unavailable */ }
    set({ installFromFile: value })
  },
}))
