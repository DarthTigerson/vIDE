import { create } from 'zustand'
import { collectPaneIds, setTerminalTabRouter, useEditorStore } from './editorStore'
import { buildTerminalPath, getTerminalId, isTerminalTab } from '@/components/Settings/paths'

// The bottom terminal: a per-project switch that locks every plain terminal
// (the editor's terminal:// tabs, never the agent bar's sessions) into one
// panel under the editor, split into at most two sides, each with its own
// tabs. Terminals only change owner here — TerminalTab keeps the xterm and
// PTY alive across the move as long as one of the two still holds the id.

export interface TerminalOrigin {
  paneId: string
  index: number
}

export interface BottomTerminalSnapshot {
  enabled: boolean
  sides: string[][]
  active: (string | null)[]
  origins: Record<string, TerminalOrigin>
  size: number
}

export const DEFAULT_BOTTOM_TERMINAL_SIZE = 35

interface BottomTerminalState extends BottomTerminalSnapshot {
  focusedSide: number
  has: (id: string) => boolean
  setEnabled: (enabled: boolean) => void
  newTerminal: (side?: number) => string
  openTerminal: (id: string, side?: number) => void
  closeTerminal: (id: string) => void
  // Every terminal but `id`, on both sides.
  closeOthers: (id: string) => void
  closeAll: () => void
  setActive: (side: number, id: string) => void
  setFocusedSide: (side: number) => void
  split: () => void
  unsplit: () => void
  // Splits by moving `id` out of a lone side: to a new right side (after)
  // or left side (before). Needs another tab to stay behind.
  splitWith: (id: string, placement: 'before' | 'after') => void
  // Moves a tab to `side`, before `beforeId` (or to the end).
  moveTerminal: (id: string, side: number, beforeId?: string | null) => void
  setSize: (size: number) => void
  // A project's saved slice (lib/bottomTerminalSession.ts); also sweeps in
  // any editor terminal tabs when it comes back switched on.
  hydrate: (saved: unknown) => void
  reset: () => void
}

const emptyState = (): Omit<BottomTerminalSnapshot, 'size'> & { focusedSide: number } => ({
  enabled: false,
  sides: [[]],
  active: [null],
  origins: {},
  focusedSide: 0,
})

export function newTerminalId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Drops empty sides (closing the right side's last tab collapses the split;
// emptying the left one makes the right the left) and repairs each side's
// active tab. A lone side stays, even when empty.
function normalize(sides: string[][], active: (string | null)[], focusedSide: number) {
  const kept = sides
    .map((ids, i) => ({ ids, active: active[i] ?? null, i }))
    .filter(({ ids }) => ids.length > 0)
  if (kept.length === 0) return { sides: [[]], active: [null], focusedSide: 0 }
  return {
    sides: kept.map(({ ids }) => ids),
    active: kept.map(({ ids, active: a }) => (a && ids.includes(a) ? a : ids[ids.length - 1])),
    focusedSide: Math.max(0, kept.findIndex(({ i }) => i === focusedSide)),
  }
}

function isSnapshot(value: unknown): value is BottomTerminalSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.enabled === 'boolean'
    && Array.isArray(v.sides) && v.sides.length >= 1 && v.sides.length <= 2
    && v.sides.every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'))
}

export const useBottomTerminalStore = create<BottomTerminalState>((set, get) => {
  // Moves every terminal tab in the editor to the left side, remembering
  // where each one was so switching off can put it back.
  const absorbEditorTerminals = () => {
    const editor = useEditorStore.getState()
    const moved: string[] = []
    const origins: Record<string, TerminalOrigin> = {}
    for (const paneId of collectPaneIds(editor.layout)) {
      ;(editor.paneTabLists[paneId] ?? []).forEach((path, index) => {
        if (!isTerminalTab(path)) return
        const id = getTerminalId(path)
        moved.push(id)
        origins[id] = { paneId, index }
      })
    }
    if (moved.length === 0) return
    // Claim first, detach second: TerminalTab tears a terminal down when it
    // unmounts with no owner, so there must never be a moment with neither.
    set((state) => {
      const sides = state.sides.map((ids, i) => (i === 0 ? [...ids, ...moved.filter((id) => !ids.includes(id))] : ids))
      const active = [...state.active]
      active[0] = active[0] ?? moved[moved.length - 1]
      return { sides, active, origins: { ...state.origins, ...origins } }
    })
    editor.detachTabs(moved.map(buildTerminalPath))
  }

  return {
    ...emptyState(),
    size: DEFAULT_BOTTOM_TERMINAL_SIZE,

    has: (id) => get().sides.some((ids) => ids.includes(id)),

    setEnabled: (enabled) => {
      if (enabled === get().enabled) return
      if (enabled) {
        set({ enabled: true })
        absorbEditorTerminals()
        if (get().sides.every((ids) => ids.length === 0)) get().newTerminal(0)
        return
      }
      const { sides, origins } = get()
      // Hand back first, release second (same reason as absorbing).
      useEditorStore.getState().restoreTabs(
        sides.flat().map((id) => ({
          tab: { path: buildTerminalPath(id), content: '', dirty: false },
          paneId: origins[id]?.paneId ?? null,
          index: origins[id]?.index ?? null,
        }))
      )
      set(emptyState())
    },

    newTerminal: (side) => {
      const id = newTerminalId()
      get().openTerminal(id, side)
      return id
    },

    openTerminal: (id, side) => {
      set((state) => {
        const existing = state.sides.findIndex((ids) => ids.includes(id))
        if (existing !== -1) {
          const active = [...state.active]
          active[existing] = id
          return { active, focusedSide: existing }
        }
        const target = Math.min(side ?? state.focusedSide, state.sides.length - 1)
        const sides = state.sides.map((ids, i) => (i === target ? [...ids, id] : ids))
        const active = [...state.active]
        active[target] = id
        return { sides, active, focusedSide: target }
      })
    },

    closeTerminal: (id) => {
      set((state) => {
        const side = state.sides.findIndex((ids) => ids.includes(id))
        if (side === -1) return state
        const list = state.sides[side]
        const at = list.indexOf(id)
        const remaining = list.filter((x) => x !== id)
        const sides = state.sides.map((ids, i) => (i === side ? remaining : ids))
        const active = [...state.active]
        if (active[side] === id) active[side] = remaining[Math.min(at, remaining.length - 1)] ?? null
        const origins = { ...state.origins }
        delete origins[id]
        return { ...normalize(sides, active, state.focusedSide), origins }
      })
    },

    closeOthers: (id) => {
      set((state) => {
        if (!state.sides.some((ids) => ids.includes(id))) return state
        const origins = state.origins[id] ? { [id]: state.origins[id] } : {}
        return { ...normalize(state.sides.map((ids) => ids.filter((x) => x === id)), [id, id], state.focusedSide), origins }
      })
    },

    closeAll: () => set({ sides: [[]], active: [null], focusedSide: 0, origins: {} }),

    setActive: (side, id) => {
      set((state) => {
        if (!state.sides[side]?.includes(id)) return state
        const active = [...state.active]
        active[side] = id
        return { active, focusedSide: side }
      })
    },

    setFocusedSide: (side) => {
      if (side < get().sides.length && side !== get().focusedSide) set({ focusedSide: side })
    },

    split: () => {
      if (get().sides.length >= 2) return
      const id = newTerminalId()
      set((state) => ({ sides: [state.sides[0], [id]], active: [state.active[0], id], focusedSide: 1 }))
    },

    unsplit: () => {
      set((state) => {
        if (state.sides.length < 2) return state
        return { sides: [[...state.sides[0], ...state.sides[1]]], active: [state.active[0] ?? state.active[1]], focusedSide: 0 }
      })
    },

    splitWith: (id, placement) => {
      set((state) => {
        if (state.sides.length !== 1 || state.sides[0].length < 2 || !state.sides[0].includes(id)) return state
        const rest = state.sides[0].filter((x) => x !== id)
        const restActive = state.active[0] && state.active[0] !== id ? state.active[0] : rest[rest.length - 1]
        return placement === 'after'
          ? { sides: [rest, [id]], active: [restActive, id], focusedSide: 1 }
          : { sides: [[id], rest], active: [id, restActive], focusedSide: 0 }
      })
    },

    moveTerminal: (id, side, beforeId) => {
      set((state) => {
        const from = state.sides.findIndex((ids) => ids.includes(id))
        if (from === -1 || side >= state.sides.length || id === beforeId) return state
        const sides = state.sides.map((ids) => ids.filter((x) => x !== id))
        const target = sides[side]
        const at = beforeId ? target.indexOf(beforeId) : -1
        target.splice(at === -1 ? target.length : at, 0, id)
        const active = [...state.active]
        if (from !== side && active[from] === id) active[from] = null
        active[side] = id
        return normalize(sides, active, side)
      })
    },

    setSize: (size) => {
      if (size > 0 && size !== get().size) set({ size })
    },

    hydrate: (saved) => {
      if (isSnapshot(saved)) {
        const sides = saved.sides.map((ids) => [...new Set(ids)])
        const active = Array.isArray(saved.active) ? saved.active : []
        const origins = saved.origins && typeof saved.origins === 'object' ? saved.origins : {}
        set({
          enabled: saved.enabled,
          ...normalize(saved.enabled ? sides : [[]], saved.enabled ? active : [null], 0),
          origins: saved.enabled ? origins : {},
          size: typeof saved.size === 'number' && saved.size > 0 ? saved.size : DEFAULT_BOTTOM_TERMINAL_SIZE,
        })
      }
      if (get().enabled) {
        absorbEditorTerminals()
        if (get().sides.every((ids) => ids.length === 0)) get().newTerminal(0)
      }
    },

    reset: () => set({ ...emptyState(), size: DEFAULT_BOTTOM_TERMINAL_SIZE }),
  }
})

// While switched on, every new terminal tab opens down here instead.
setTerminalTabRouter((tab) => {
  if (!isTerminalTab(tab.path)) return false
  const state = useBottomTerminalStore.getState()
  if (!state.enabled) return false
  state.openTerminal(getTerminalId(tab.path))
  return true
})
