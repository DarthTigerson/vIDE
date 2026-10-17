import { create } from 'zustand'
import { NOTES_SORT_MODES, renameInOrder, type NotesManualOrder, type NotesSortMode } from '@/lib/notesSort'
import { notifySettingChanged } from '@/lib/notifySettingChanged'

const ENABLED_KEY = 'vide:notes:enabled'
// Both under vide:notes:, so vIDE Sync carries them with the notes category.
const SORT_KEY = 'vide:notes:sort'
const ORDER_KEY = 'vide:notes:order'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

function getSort(): NotesSortMode {
  const value = localStorage.getItem(SORT_KEY)
  return NOTES_SORT_MODES.some((m) => m.mode === value) ? (value as NotesSortMode) : 'alphabetical'
}

function getOrder(): NotesManualOrder {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((n) => typeof n === 'string')
        )
      )
    }
  } catch {
    // fall through to the default
  }
  return {}
}

function saveOrder(order: NotesManualOrder) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  notifySettingChanged()
}

interface NotesSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  sort: NotesSortMode
  setSort: (value: NotesSortMode) => void
  // Keys and paths are relative to the notes root (see NotesManualOrder).
  order: NotesManualOrder
  setFolderOrder: (relDir: string, names: string[]) => void
  renameInOrder: (oldRelPath: string, newRelPath: string) => void
}

export const useNotesSettingsStore = create<NotesSettingsStore>((set, get) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },

  sort: getSort(),

  setSort: (value) => {
    localStorage.setItem(SORT_KEY, value)
    set({ sort: value })
    notifySettingChanged()
  },

  order: getOrder(),

  setFolderOrder: (relDir, names) => {
    const order = { ...get().order, [relDir]: names }
    saveOrder(order)
    set({ order })
  },

  renameInOrder: (oldRelPath, newRelPath) => {
    const order = renameInOrder(get().order, oldRelPath, newRelPath)
    saveOrder(order)
    set({ order })
  },
}))
