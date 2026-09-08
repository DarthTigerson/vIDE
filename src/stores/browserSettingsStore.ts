import { create } from 'zustand'

const OPEN_IN_BIGGEST_PANE_KEY = 'vide:browser:openInBiggestPane'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface BrowserSettingsStore {
  openInBiggestPane: boolean
  setOpenInBiggestPane: (value: boolean) => void
}

export const useBrowserSettingsStore = create<BrowserSettingsStore>((set) => ({
  openInBiggestPane: getBool(OPEN_IN_BIGGEST_PANE_KEY, true),

  setOpenInBiggestPane: (value) => {
    localStorage.setItem(OPEN_IN_BIGGEST_PANE_KEY, String(value))
    set({ openInBiggestPane: value })
  },
}))
