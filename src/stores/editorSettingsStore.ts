import { create } from 'zustand'

const KEYS = {
  autoSaveEnabled: 'vide:editor:autoSaveEnabled',
  wordWrapEnabled: 'vide:editor:wordWrapEnabled',
  changeAllOccurrencesInMenu: 'vide:editor:changeAllOccurrencesInMenu',
}

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface EditorSettingsStore {
  autoSaveEnabled: boolean
  setAutoSaveEnabled: (value: boolean) => void
  wordWrapEnabled: boolean
  setWordWrapEnabled: (value: boolean) => void
  toggleWordWrap: () => void
  // Controls whether "Change All Occurrences" is listed in the editor's
  // right-click menu - off by default (available via Settings or ⌘F2
  // instead). The ⌘F2 keybinding for it works regardless of this setting;
  // it only hides/shows the menu entry.
  changeAllOccurrencesInMenu: boolean
  setChangeAllOccurrencesInMenu: (value: boolean) => void
}

export const useEditorSettingsStore = create<EditorSettingsStore>((set, get) => ({
  autoSaveEnabled: getBool(KEYS.autoSaveEnabled, false),

  setAutoSaveEnabled: (value) => {
    localStorage.setItem(KEYS.autoSaveEnabled, String(value))
    set({ autoSaveEnabled: value })
  },

  wordWrapEnabled: getBool(KEYS.wordWrapEnabled, false),

  setWordWrapEnabled: (value) => {
    localStorage.setItem(KEYS.wordWrapEnabled, String(value))
    set({ wordWrapEnabled: value })
  },

  toggleWordWrap: () => get().setWordWrapEnabled(!get().wordWrapEnabled),

  changeAllOccurrencesInMenu: getBool(KEYS.changeAllOccurrencesInMenu, false),

  setChangeAllOccurrencesInMenu: (value) => {
    localStorage.setItem(KEYS.changeAllOccurrencesInMenu, String(value))
    set({ changeAllOccurrencesInMenu: value })
  },
}))
