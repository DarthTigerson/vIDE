import { create } from 'zustand'

const KEY = 'vide:browser:defaultUrl'
export const DEFAULT_BROWSER_URL = 'http://localhost:5173'

interface BrowserSettingsStore {
  defaultUrl: string
  setDefaultUrl: (value: string) => void
}

export const useBrowserSettingsStore = create<BrowserSettingsStore>((set) => ({
  defaultUrl: localStorage.getItem(KEY) || DEFAULT_BROWSER_URL,

  setDefaultUrl: (value) => {
    localStorage.setItem(KEY, value)
    set({ defaultUrl: value })
  },
}))
