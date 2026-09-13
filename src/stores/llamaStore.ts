import { create } from 'zustand'

// Availability state for llama.cpp on this machine, probed once per panel
// mount via the main process (see electron/llama.ts). Same shape as
// graphifyStore's availability slice — the panel derives its UI from
// `available`/`checking` and never re-probes once a non-null value lands.
interface LlamaStore {
  available: boolean | null
  checking: boolean
  checkAvailable: () => Promise<void>
}

export const useLlamaStore = create<LlamaStore>((set, get) => ({
  available: null,
  checking: false,

  checkAvailable: async () => {
    if (get().checking) return
    set({ checking: true })
    try {
      const available = await window.api.llamaIsAvailable()
      set({ available, checking: false })
    } catch {
      // Must land on a non-null `available` here — LlamaPanel's mount effect
      // re-fires whenever `checking` flips back to false while `available`
      // is still null, so leaving it null on failure causes an infinite
      // checkAvailable() retry loop.
      set({ available: false, checking: false })
    }
  },
}))
