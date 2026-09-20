import { create } from 'zustand'

// State of the in-editor find box. What you search for (query, flags,
// replacement) is shared across panes, like most editors; whether the box is
// open, and whether its replace row is showing, is per pane.

export type FindToggle = 'caseSensitive' | 'wholeWord' | 'regex'

interface PaneFind {
  open: boolean
  showReplace: boolean
  // Bumped on every open so an already-open box refocuses its input.
  focusTick: number
}

interface NavRequest {
  paneId: string
  delta: 1 | -1
  tick: number
}

interface EditorFindState {
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  panes: Record<string, PaneFind>
  // F3 / Cmd+G: the box (which owns the controller) picks this up.
  navRequest: NavRequest | null

  setQuery: (query: string) => void
  setReplacement: (replacement: string) => void
  toggle: (flag: FindToggle) => void
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

const closedPane: PaneFind = { open: false, showReplace: false, focusTick: 0 }

let navTick = 0

export const useEditorFindStore = create<EditorFindState>((set, get) => ({
  query: '',
  replacement: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  panes: {},
  navRequest: null,

  setQuery: (query) => set({ query }),
  setReplacement: (replacement) => set({ replacement }),
  toggle: (flag) => set({ [flag]: !get()[flag] } as Pick<EditorFindState, FindToggle>),

  openFind: (paneId, options = {}) => {
    const pane = get().panes[paneId] ?? closedPane
    const seed = options.seed
    const useSeed = !!seed && !seed.includes('\n') && seed.length <= MAX_SEED_LENGTH
    set({
      ...(useSeed ? { query: seed } : {}),
      panes: {
        ...get().panes,
        [paneId]: {
          open: true,
          showReplace: options.replace ?? pane.showReplace,
          focusTick: pane.focusTick + 1,
        },
      },
    })
  },

  closeFind: (paneId) => {
    const pane = get().panes[paneId]
    if (!pane) return
    set({ panes: { ...get().panes, [paneId]: { ...pane, open: false } } })
  },

  toggleReplace: (paneId) => {
    const pane = get().panes[paneId] ?? closedPane
    set({ panes: { ...get().panes, [paneId]: { ...pane, showReplace: !pane.showReplace } } })
  },

  requestNav: (paneId, delta) => {
    if (!get().panes[paneId]?.open) get().openFind(paneId)
    set({ navRequest: { paneId, delta, tick: ++navTick } })
  },

  clearNavRequest: () => set({ navRequest: null }),
}))
