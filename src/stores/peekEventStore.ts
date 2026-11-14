import { create } from 'zustand'
import { useNotificationPanelStore } from './notificationPanelStore'

// Which domain icon the peek row shows. A key rather than a ReactNode so
// plain .ts stores (gitReposStore, updateStore) can fire events too.
export type PeekEventKind = 'claude' | 'git' | 'browser' | 'update' | 'info'

export interface PeekEvent {
  id: string
  text: string
  kind: PeekEventKind
  at: number
  seq: number
}

interface PeekEventState {
  events: PeekEvent[]
  show: (text: string, kind?: PeekEventKind) => void
  remove: (id: string) => void
}

// Never reset, even when events empties, so ids stay unique and the peek's
// "newest seq seen" check always moves forward.
let lastSeq = 0

// One-off events (confirmations, quick errors) shown only in the
// NotificationPeek above the bell for PEEK_MS, then gone (VIDE-110). Unlike
// condition notifications (useNotificationItems) they never ring the bell,
// count as unread, or appear in the NotificationPanel — a repo switch must
// not pile up in the bell. Replaces the old centre-footer status message.
export const usePeekEventStore = create<PeekEventState>((set, get) => ({
  events: [],

  show: (text, kind = 'info') => {
    // The open panel replaces the peek, so there'd be nowhere to show it.
    if (useNotificationPanelStore.getState().open) return
    const seq = ++lastSeq
    // Same text again (e.g. clicking a dead link twice) restarts that row
    // instead of stacking a duplicate.
    set({
      events: [
        ...get().events.filter((e) => e.text !== text),
        { id: `peek-event-${seq}`, text, kind, at: Date.now(), seq },
      ],
    })
  },

  remove: (id) => {
    if (get().events.some((e) => e.id === id)) set({ events: get().events.filter((e) => e.id !== id) })
  },
}))
