import { create } from 'zustand'

const CLOSE_SIDE_PANEL_KEY = 'vide:gitRemote:closeSidePanel'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

// The remote launcher's URL is no longer typed in: it's read from each repo's
// git remote (see gitRemoteUrlStore). Only the open behavior is a setting.
interface GitRemoteSettingsStore {
  closeSidePanelOnOpen: boolean
  setCloseSidePanelOnOpen: (value: boolean) => void
}

export const useGitRemoteSettingsStore = create<GitRemoteSettingsStore>((set) => ({
  closeSidePanelOnOpen: getBool(CLOSE_SIDE_PANEL_KEY, false),

  setCloseSidePanelOnOpen: (value) => {
    localStorage.setItem(CLOSE_SIDE_PANEL_KEY, String(value))
    set({ closeSidePanelOnOpen: value })
  },
}))
