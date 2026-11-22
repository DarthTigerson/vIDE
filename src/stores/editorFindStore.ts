import { create } from 'zustand'

// State of the in-editor find box, kept per pane: each split editor has its
// own search text, replacement, flags, open state and replace row, so typing in
// one pane's box never changes another's.

export type FindToggle = 'caseSensitive' | 'wholeWord' | 'regex'

export interface PaneFind {
  open: boolean
  showReplace: boolean
  // Bumped on every open so an already-open box refocuses its input.
  focusTick: number
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

interface NavRequest {
  paneId: string
  delta: 1 | -1
  tick: number
}

interface EditorFindState {
  panes: Record<string, PaneFind>
  // F3 / Cmd+G: the box (which owns the controller) picks this up.
  navRequest: NavRequest | null

  setQuery: (paneId: string, query: string) => void
  setReplacement: (paneId: string, replacement: string) => void
  toggle: (paneId: string, flag: FindToggle) => void
  // `replace: true` opens with the replace row; leaving it out keeps whatever
  // the pane had. `seed` is the editor's selected text, used as the query when
  // it is a sensible single line.
  openFind: (paneId: string, options?: { replace?: boolean; seed?: string | null }) => void
  closeFind: (paneId: string) => void
  toggleReplace: (paneId: string) => void
  requestNav: (paneId: string, delta: 1 | -1) => void
  clearNavRequest: () => void
}

const MAX_SEED_LENGTH = 200

export function newPaneFind(): PaneFind {
  return {
    open: false, showReplace: false, focusTick: 0,
    query: '', replacement: '', caseSensitive: false, wholeWord: false, regex: false,
  }
}

let navTick = 0

export const useEditorFindStore = create<EditorFindState>((set, get) => {
  const pane = (paneId: string): PaneFind => get().panes[paneId] ?? newPaneFind()
  const patch = (paneId: string, change: Partial<PaneFind>) =>
    set({ panes: { ...get().panes, [paneId]: { ...pane(paneId), ...change } } })

  return {
    panes: {},
    navRequest: null,

    setQuery: (paneId, query) => patch(paneId, { query }),
    setReplacement: (paneId, replacement) => patch(paneId, { replacement }),
    toggle: (paneId, flag) => patch(paneId, { [flag]: !pane(paneId)[flag] }),

    openFind: (paneId, options = {}) => {
      const current = pane(paneId)
      const seed = options.seed
      const useSeed = !!seed && !seed.includes('\n') && seed.length <= MAX_SEED_LENGTH
      patch(paneId, {
        ...(useSeed ? { query: seed } : {}),
        open: true,
        showReplace: options.replace ?? current.showReplace,
        focusTick: current.focusTick + 1,
      })
    },

    closeFind: (paneId) => {
      if (!get().panes[paneId]) return
      patch(paneId, { open: false })
    },

    toggleReplace: (paneId) => patch(paneId, { showReplace: !pane(paneId).showReplace }),

    requestNav: (paneId, delta) => {
      if (!get().panes[paneId]?.open) get().openFind(paneId)
      set({ navRequest: { paneId, delta, tick: ++navTick } })
    },

    clearNavRequest: () => set({ navRequest: null }),
  }
})
