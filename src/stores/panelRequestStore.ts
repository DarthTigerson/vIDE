import { create } from 'zustand'

// Every left-side panel App.tsx can show. App's own `leftPanel` state is the
// single source of truth for which one is open; anything outside App that
// wants a panel shown (a notification click, "Open File" from a diff) asks
// for it here and App applies it via usePanelRequests.
export type RequestablePanel =
  | 'files' | 'git' | 'docker' | 'mobile' | 'graphify' | 'todos' | 'notes' | 'llama' | 'settings'

interface PanelRequestStore {
  // A fresh object every call (not a bare string) so requesting the same
  // panel twice in a row still changes the value and re-triggers App's effect
  // — same reason dockerOffAlertStore/gitPanelOpenAlertStore use a counter.
  request: { panel: RequestablePanel } | null
  requestPanel: (panel: RequestablePanel) => void
}

export const usePanelRequestStore = create<PanelRequestStore>((set) => ({
  request: null,
  requestPanel: (panel) => set({ request: { panel } }),
}))
