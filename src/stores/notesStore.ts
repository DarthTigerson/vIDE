import { create } from 'zustand'

interface NotesStore {
  root: string | null
  loadRoot: () => Promise<void>
}

export const useNotesStore = create<NotesStore>((set) => ({
  root: null,

  loadRoot: async () => {
    const root = await window.api.notesGetRoot()
    set({ root })
  },
}))
