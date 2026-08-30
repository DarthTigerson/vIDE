import { create } from 'zustand'
import { DEFAULT_MOBILE_DEVICE_ID } from '@/components/Browser/mobileDevices'

export interface BrowserTabState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  webContentsId: number | null
  loadError: string | null
  zoomLevel: number
  mobileMode: boolean
  mobileDeviceId: string
}

interface BrowserStore {
  tabs: Record<string, BrowserTabState>
  fullscreenId: string | null
  ensureTab: (id: string, initialUrl: string) => void
  updateTab: (id: string, patch: Partial<BrowserTabState>) => void
  removeTab: (id: string) => void
  toggleFullscreen: (id: string) => void
  exitFullscreen: () => void
}

const DEFAULT_STATE: BrowserTabState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  webContentsId: null,
  loadError: null,
  zoomLevel: 0,
  mobileMode: false,
  mobileDeviceId: DEFAULT_MOBILE_DEVICE_ID,
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tabs: {},
  fullscreenId: null,

  ensureTab: (id, initialUrl) => {
    if (get().tabs[id]) return
    set((s) => ({ tabs: { ...s.tabs, [id]: { ...DEFAULT_STATE, url: initialUrl } } }))
  },

  updateTab: (id, patch) => {
    set((s) => {
      const existing = s.tabs[id] ?? DEFAULT_STATE
      return { tabs: { ...s.tabs, [id]: { ...existing, ...patch } } }
    })
  },

  removeTab: (id) => {
    set((s) => {
      if (!(id in s.tabs)) return s
      const tabs = { ...s.tabs }
      delete tabs[id]
      return { tabs, fullscreenId: s.fullscreenId === id ? null : s.fullscreenId }
    })
  },

  toggleFullscreen: (id) => {
    set((s) => ({ fullscreenId: s.fullscreenId === id ? null : id }))
  },

  exitFullscreen: () => set({ fullscreenId: null }),
}))
