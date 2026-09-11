import { create } from 'zustand'

interface NotificationPanelState {
  open: boolean
  toggle: () => void
  close: () => void
}

export const useNotificationPanelStore = create<NotificationPanelState>((set, get) => ({
  open: false,
  toggle: () => set({ open: !get().open }),
  close: () => set({ open: false }),
}))
