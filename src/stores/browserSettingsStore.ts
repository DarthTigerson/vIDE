import { create } from 'zustand'

const KEY = 'vide:browser:defaultUrl'
const OPEN_IN_BIGGEST_PANE_KEY = 'vide:browser:openInBiggestPane'
export const DEFAULT_BROWSER_URL = 'http://localhost:5173'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface BrowserSettingsStore {
  defaultUrl: string
  setDefaultUrl: (value: string) => void
  openInBiggestPane: boolean
  setOpenInBiggestPane: (value: boolean) => void
}

export const useBrowserSettingsStore = create<BrowserSettingsStore>((set) => ({
  defaultUrl: localStorage.getItem(KEY) || DEFAULT_BROWSER_URL,

  setDefaultUrl: (value) => {
    localStorage.setItem(KEY, value)
    set({ defaultUrl: value })
  },

  openInBiggestPane: getBool(OPEN_IN_BIGGEST_PANE_KEY, true),

  setOpenInBiggestPane: (value) => {
    localStorage.setItem(OPEN_IN_BIGGEST_PANE_KEY, String(value))
    set({ openInBiggestPane: value })
  },
}))
