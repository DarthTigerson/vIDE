import { create } from 'zustand'
import type { MobileState } from '@/types/api'

interface MobileStore {
  state: MobileState
  initialized: boolean
  init: () => Promise<void>
}

const DEFAULT_STATE: MobileState = {
  running: false,
  port: 7842,
  localIp: '127.0.0.1',
  pin: '',
  qrSvg: '',
  connectedCount: 0,
  allowingNewDevice: true,
  interfaces: [],
  devices: [],
  tlsFingerprint: '',
}

export const useMobileStore = create<MobileStore>((set, get) => ({
  state: DEFAULT_STATE,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.onMobileState((state) => set({ state }))
    const state = await window.api.mobileGetState()
    set({ state })
  },
}))
