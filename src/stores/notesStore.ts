import { create } from 'zustand'

interface NotesStore {
  root: string | null
  syncVersion: number
  loadRoot: () => Promise<void>
  bumpSyncVersion: () => void
}

export const useNotesStore = create<NotesStore>((set) => ({
  root: null,
  syncVersion: 0,

  loadRoot: async () => {
    const root = await window.api.notesGetRoot()
    set({ root })
  },

  bumpSyncVersion: () => set((s) => ({ syncVersion: s.syncVersion + 1 })),
}))
