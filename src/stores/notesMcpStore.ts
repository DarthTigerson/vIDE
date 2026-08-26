import { create } from 'zustand'

const ENABLED_KEY = 'vide:notes:mcpEnabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface NotesMcpStore {
  enabled: boolean
  pending: boolean
  error: string | null
  setEnabled: (value: boolean) => Promise<void>
}

export const useNotesMcpStore = create<NotesMcpStore>((set) => ({
  enabled: getBool(ENABLED_KEY, false),
  pending: false,
  error: null,

  setEnabled: async (value) => {
    set({ pending: true, error: null })
    try {
      if (value) await window.api.notesMcpEnable()
      else await window.api.notesMcpDisable()
      localStorage.setItem(ENABLED_KEY, String(value))
      set({ enabled: value, pending: false })
    } catch (err) {
      set({ pending: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
