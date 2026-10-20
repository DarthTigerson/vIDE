import { create } from 'zustand'

// One-at-a-time coordination for the footer's chip popovers (Autocomplete,
// Display). Each chip stops the opening click from propagating so it doesn't
// immediately close itself — which also meant it never closed its sibling.
// Routing their open state through a single `openId` makes opening one close
// any other for free, and a click elsewhere still closes via `close()`.
interface FooterPopoverState {
  openId: string | null
  toggle: (id: string) => void
  close: () => void
}

export const useFooterPopoverStore = create<FooterPopoverState>((set, get) => ({
  openId: null,
  toggle: (id) => set({ openId: get().openId === id ? null : id }),
  close: () => set({ openId: null }),
}))
