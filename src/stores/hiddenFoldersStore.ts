import { create } from 'zustand'
import { notifySettingChanged } from '../lib/notifySettingChanged'

// Under vide:general: so vIDE Sync carries them with the other file tree
// settings.
const HIDDEN_KEY = 'vide:general:fileTreeHidden'
const CUSTOM_KEY = 'vide:general:fileTreeCustomHidden'

function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeList(key: string, value: string[]) {
  localStorage.setItem(key, JSON.stringify(value))
  notifySettingChanged()
}

interface HiddenFoldersStore {
  // Names hidden from the file tree, at any depth. Nothing is hidden by
  // default, so the tree looks the same until the user opts in.
  hidden: string[]
  setHidden: (name: string, value: boolean) => void
  // User-added names shown in Settings > Site Tree alongside the presets.
  custom: string[]
  addCustom: (name: string) => void
  removeCustom: (name: string) => void
}

export const useHiddenFoldersStore = create<HiddenFoldersStore>((set, get) => ({
  hidden: readList(HIDDEN_KEY),

  setHidden: (name, value) => {
    const without = get().hidden.filter((n) => n !== name)
    const hidden = value ? [...without, name] : without
    writeList(HIDDEN_KEY, hidden)
    set({ hidden })
  },

  custom: readList(CUSTOM_KEY),

  addCustom: (name) => {
    if (get().custom.includes(name)) return
    const custom = [...get().custom, name]
    writeList(CUSTOM_KEY, custom)
    set({ custom })
  },

  removeCustom: (name) => {
    const custom = get().custom.filter((n) => n !== name)
    writeList(CUSTOM_KEY, custom)
    set({ custom })
    get().setHidden(name, false)
  },
}))
