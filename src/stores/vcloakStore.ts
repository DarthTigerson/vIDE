import { create } from 'zustand'
import type { VcloakState } from '../../electron/vcloak/types'

// Not persisted: vCloak state lives in the main process.
interface VcloakStore {
  state: VcloakState | null
  load: () => Promise<void>
  // Resolves null on success, else the error message.
  setEnabled: (enabled: boolean) => Promise<string | null>
  setState: (state: VcloakState) => void
}

export const useVcloakStore = create<VcloakStore>((set) => ({
  state: null,
  load: async () => {
    try { set({ state: await window.api.vcloakGetState() }) } catch { /* keep current */ }
  },
  setEnabled: async (enabled) => {
    try {
      const res = await window.api.vcloakSetConfig({ enabled })
      if (res.ok) { set({ state: res.state }); return null }
      return res.error
    } catch (e) {
      return String((e as Error)?.message ?? e)
    }
  },
  setState: (state) => set({ state }),
}))
