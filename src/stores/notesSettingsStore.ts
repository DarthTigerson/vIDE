import { create } from 'zustand'

const ENABLED_KEY = 'vide:notes:enabled'
const OPEN_IN_BIGGEST_PANE_KEY = 'vide:notes:openInBiggestPane'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface NotesSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  openInBiggestPane: boolean
  setOpenInBiggestPane: (value: boolean) => void
}

export const useNotesSettingsStore = create<NotesSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },

  openInBiggestPane: getBool(OPEN_IN_BIGGEST_PANE_KEY, false),

  setOpenInBiggestPane: (value) => {
    localStorage.setItem(OPEN_IN_BIGGEST_PANE_KEY, String(value))
    set({ openInBiggestPane: value })
  },
}))
