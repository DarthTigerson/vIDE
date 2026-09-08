import { create } from 'zustand'

const ENABLED_KEY = 'vide:todo:enabled'
const OPEN_IN_BIGGEST_PANE_KEY = 'vide:todo:openInBiggestPane'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface TodoSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  openInBiggestPane: boolean
  setOpenInBiggestPane: (value: boolean) => void
}

export const useTodoSettingsStore = create<TodoSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },

  openInBiggestPane: getBool(OPEN_IN_BIGGEST_PANE_KEY, true),

  setOpenInBiggestPane: (value) => {
    localStorage.setItem(OPEN_IN_BIGGEST_PANE_KEY, String(value))
    set({ openInBiggestPane: value })
  },
}))
