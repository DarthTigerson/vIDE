import { create } from 'zustand'
import type { AppInfo, RegistryState, StoreListing } from '@/types/api'
import { DISMISSED_UPDATES_KEY, hasUpdate, updateNoticeId } from '@/lib/storeUpdates'

// The vSuite Store catalog as the main process last reported it
// (electron/store.ts). Nothing here is persisted or synced.
interface StoreStoreState {
  registry: RegistryState | null
  loading: boolean
  // refresh=false may return the main process's session copy instantly.
  load: (refresh?: boolean) => Promise<void>
  // In-flight install/uninstall per app id, and the last failure message.
  busy: Record<string, 'installing' | 'uninstalling'>
  errors: Record<string, string>
  install: (id: string) => Promise<void>
  uninstall: (id: string) => Promise<void>
  // Update-notice ids the user closed with the bell's x; survives restarts.
  dismissedUpdates: string[]
  dismissUpdate: (noticeId: string) => void
}

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_UPDATES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

let inFlight: Promise<void> | null = null

export const useStoreStore = create<StoreStoreState>((set, get) => ({
  registry: null,
  loading: false,
  busy: {},
  errors: {},
  dismissedUpdates: readDismissed(),
  dismissUpdate: (noticeId) => {
    let next = [...new Set([...get().dismissedUpdates, noticeId])]
    // Forget ids for versions the catalog no longer offers.
    const registry = get().registry
    if (registry?.status === 'ok') {
      const live = new Set(registry.apps.map((a) => updateNoticeId(a.id, a.latest.version)))
      next = next.filter((id) => live.has(id))
    }
    set({ dismissedUpdates: next })
    try { localStorage.setItem(DISMISSED_UPDATES_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  },
  install: (id) => run(id, 'installing', () => window.api.appsInstall(id), set, get),
  uninstall: (id) => run(id, 'uninstalling', () => window.api.appsUninstall(id), set, get),
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

// Installed state lives in appContribStore (refreshed by apps:changed); this
// store only tracks the request in flight and its error.
async function run(
  id: string,
  kind: 'installing' | 'uninstalling',
  call: () => Promise<{ ok: true } | { ok: false; error: string }>,
  set: (partial: Partial<StoreStoreState>) => void,
  get: () => StoreStoreState,
): Promise<void> {
  if (get().busy[id]) return
  const { [id]: _e, ...restErrors } = get().errors
  void _e
  set({ busy: { ...get().busy, [id]: kind }, errors: restErrors })
  let error: string | null = null
  try {
    const res = await call()
    if (!res.ok) error = res.error
  } catch (e) {
    error = String(e)
  }
  const { [id]: _b, ...restBusy } = get().busy
  void _b
  set({ busy: restBusy, errors: error ? { ...get().errors, [id]: error } : get().errors })
}

export type AppAction = 'install' | 'update' | 'open' | 'needs-vide' | 'restart' | 'failed'

// What a Store row/page offers for an app. Dev apps (loaded from a folder) are
// not "installed" as far as the Store goes: they never get Update and Install
// stays available.
export function appAction(listing: StoreListing | undefined, installedApp: AppInfo | undefined): AppAction {
  const installed = installedApp?.source === 'store' ? installedApp : undefined
  if (!installed) return listing && !listing.compatible ? 'needs-vide' : 'install'
  if (installed.status === 'restart-required') return 'restart'
  if (installed.status === 'failed') return 'failed'
  if (hasUpdate(listing, installed)) return 'update'
  return 'open'
}

let subscribed = false
// Reloads the catalog (without a network refresh) whenever main's periodic
// refresh changed it. Safe to call from several components; subscribes once.
export function subscribeStoreChanged(): void {
  if (subscribed) return
  subscribed = true
  window.api.onStoreChanged(() => { void useStoreStore.getState().load(false) })
}

// Starts what the bell's update notices need: the catalog (if nothing loaded
// it yet) and the store:changed subscription.
export function startStoreUpdates(): void {
  if (typeof window.api?.storeGetRegistry !== 'function') return
  subscribeStoreChanged()
  if (!useStoreStore.getState().registry) void useStoreStore.getState().load(false)
}
