import { create } from 'zustand'

const OPEN_IN_BIGGEST_PANE_KEY = 'vide:general:openInBiggestPane'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface GeneralSettingsStore {
  openInBiggestPane: boolean
  setOpenInBiggestPane: (value: boolean) => void
}

export const useGeneralSettingsStore = create<GeneralSettingsStore>((set) => ({
  openInBiggestPane: getBool(OPEN_IN_BIGGEST_PANE_KEY, true),

  setOpenInBiggestPane: (value) => {
    localStorage.setItem(OPEN_IN_BIGGEST_PANE_KEY, String(value))
    set({ openInBiggestPane: value })
  },
}))
