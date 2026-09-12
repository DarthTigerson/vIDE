import { create } from 'zustand'

interface GitPanelOpenAlertStore {
  // Monotonic counter rather than a boolean flag so App.tsx's effect fires
  // every click, even if the Git panel is already open — mirrors
  // dockerOffAlertStore's shape for the same reason.
  openRequest: number
  requestOpen: () => void
}

export const useGitPanelOpenAlertStore = create<GitPanelOpenAlertStore>((set, get) => ({
  openRequest: 0,
  requestOpen: () => set({ openRequest: get().openRequest + 1 }),
}))
