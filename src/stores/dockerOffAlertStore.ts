import { create } from 'zustand'

interface DockerOffAlertStore {
  // Monotonic counter rather than a boolean flag so App.tsx's effect fires
  // every click, even if Docker is still stopped from a previous request.
  openRequest: number
  requestOpen: () => void
}

export const useDockerOffAlertStore = create<DockerOffAlertStore>((set, get) => ({
  openRequest: 0,
  requestOpen: () => set({ openRequest: get().openRequest + 1 }),
}))
