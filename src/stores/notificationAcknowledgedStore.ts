import { create } from 'zustand'

interface NotificationAcknowledgedState {
  // Ids the user has already seen (closed the panel while they were showing)
  // — hidden from the footer/panel until reconcile() drops them, which only
  // happens once the underlying condition clears. That's what makes a later
  // re-trigger of the same id show up again instead of staying silenced.
  acknowledgedIds: string[]
  acknowledge: (ids: string[]) => void
  reconcile: (activeIds: string[]) => void
}

export const useNotificationAcknowledgedStore = create<NotificationAcknowledgedState>((set, get) => ({
  acknowledgedIds: [],

  acknowledge: (ids) => {
    const next = new Set(get().acknowledgedIds)
    for (const id of ids) next.add(id)
    set({ acknowledgedIds: Array.from(next) })
  },

  reconcile: (activeIds) => {
    const active = new Set(activeIds)
    const current = get().acknowledgedIds
    const next = current.filter((id) => active.has(id))
    if (next.length !== current.length) set({ acknowledgedIds: next })
  },
}))
