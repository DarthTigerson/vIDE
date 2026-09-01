import { create } from 'zustand'

interface DockerOffAlertStore {
  // Deliberately in-memory only, and deliberately not sticky: reset() clears
  // it back to false, called by FooterMessage whenever Docker leaves the
  // 'stopped' state (started again) or the open project changes — so
  // "Ignore" only covers the current off-stretch in the current project,
  // not the rest of the app's lifetime.
  ignored: boolean
  ignore: () => void
  reset: () => void
  // Monotonic counter rather than a boolean flag so App.tsx's effect fires
  // every click, even if Docker is still stopped from a previous request.
  openRequest: number
  requestOpen: () => void
}

export const useDockerOffAlertStore = create<DockerOffAlertStore>((set, get) => ({
  ignored: false,
  ignore: () => set({ ignored: true }),
  reset: () => { if (get().ignored) set({ ignored: false }) },
  openRequest: 0,
  requestOpen: () => set({ openRequest: get().openRequest + 1 }),
}))
