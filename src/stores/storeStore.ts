import { create } from 'zustand'
import type { RegistryState, StoreListing } from '@/types/api'

// The vSuite Store catalog as the main process last reported it
// (electron/store.ts). Nothing here is persisted or synced.
interface StoreStoreState {
  registry: RegistryState | null
  loading: boolean
  // refresh=false may return the main process's session copy instantly.
  load: (refresh?: boolean) => Promise<void>
}

let inFlight: Promise<void> | null = null

export const useStoreStore = create<StoreStoreState>((set) => ({
  registry: null,
  loading: false,
  load: (refresh = false) => {
    if (inFlight) return inFlight
    set({ loading: true })
    inFlight = window.api
      .storeGetRegistry(refresh)
      .then((registry) => set({ registry }))
      .catch((e: unknown) => set({ registry: { status: 'error', message: String(e) } }))
      .finally(() => {
        inFlight = null
        set({ loading: false })
      })
    return inFlight
  },
}))

export function findStoreApp(registry: RegistryState | null, id: string): StoreListing | null {
  return registry?.status === 'ok' ? registry.apps.find((app) => app.id === id) ?? null : null
}
