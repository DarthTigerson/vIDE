import { create } from 'zustand'
import type { AppInfo, FileSummary, InstallOutcome, RegistryState, StoreListing } from '@/types/api'
import { useAppContribStore } from '@/apps/appContribStore'
import { DISMISSED_UPDATES_KEY, MOVED_NOTICE_DISMISSED_KEY, hasUpdate, readMovedNoticeDismissed, updateNoticeId } from '@/lib/storeUpdates'

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
  // One bell item per finished install ("Installed X 1.0.0" / "Couldn't
  // install X: reason"); in memory, dismissed with the bell's x.
  events: { id: string; text: string }[]
  dismissEvent: (id: string) => void
  // Install from file: the inspected package waiting for the user's confirm.
  pendingFile: FileSummary | null
  pickFile: () => Promise<void>
  confirmFile: () => Promise<void>
  cancelFile: () => void
  // A vide://store/<id> link asked for this app's page (null id = the Store).
  openRequest: { id: string | null; seq: number } | null
  requestOpen: (id: string | null) => void
  // Update-notice ids the user closed with the bell's x; survives restarts.
  dismissedUpdates: string[]
  dismissUpdate: (noticeId: string) => void
  // The "Some apps moved to the Store" notice: remembered (per machine) once
  // dismissed, and its modal's open state.
  movedNoticeDismissed: boolean
  dismissMovedNotice: () => void
  movedNoticeOpen: boolean
  setMovedNoticeOpen: (open: boolean) => void
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
let eventSeq = 0
let openSeq = 0

export const useStoreStore = create<StoreStoreState>((set, get) => ({
  registry: null,
  loading: false,
  busy: {},
  errors: {},
  dismissedUpdates: readDismissed(),
  movedNoticeDismissed: readMovedNoticeDismissed(),
  dismissMovedNotice: () => {
    set({ movedNoticeDismissed: true, movedNoticeOpen: false })
    try { localStorage.setItem(MOVED_NOTICE_DISMISSED_KEY, 'true') } catch { /* storage unavailable */ }
  },
  movedNoticeOpen: false,
  setMovedNoticeOpen: (open) => set({ movedNoticeOpen: open }),
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
  events: [],
  dismissEvent: (id) => set({ events: get().events.filter((e) => e.id !== id) }),
  pendingFile: null,
  openRequest: null,
  requestOpen: (id) => set({ openRequest: { id, seq: ++openSeq } }),
  install: async (id) => {
    const listing = findStoreApp(get().registry, id)
    // A failed update already shows on the update notice; only a first
    // install gets its own failure item.
    const isUpdate = useAppContribStore.getState().apps.some((a) => a.id === id && a.source !== 'dev')
    let outcome: InstallOutcome | null = null
    await run(id, 'installing', async () => (outcome = await window.api.appsInstall(id)), set, get)
    const result = outcome as InstallOutcome | null
    if (result?.ok) pushEvent(set, get, `Installed ${result.name} ${result.version}`)
    else if (result && !isUpdate) pushEvent(set, get, `Couldn't install ${listing?.name ?? id}: ${result.error}`)
  },
  pickFile: async () => {
    if (get().pendingFile) return
    let res
    try {
      res = await window.api.appsPickPackage()
    } catch (e) {
      res = { ok: false as const, error: String(e) }
    }
    if (res.ok) set({ pendingFile: res.summary })
    // An empty error is the user cancelling the file dialog.
    else if (res.error) pushEvent(set, get, `Couldn't install from file: ${res.error}`)
  },
  confirmFile: async () => {
    const pending = get().pendingFile
    if (!pending) return
    set({ pendingFile: null })
    let outcome: InstallOutcome | null = null
    await run(pending.id, 'installing', async () => (outcome = await window.api.appsInstallPackage(pending.token)), set, get)
    const result = outcome as InstallOutcome | null
    if (result?.ok) pushEvent(set, get, `Installed ${result.name} ${result.version}`)
    else if (result) pushEvent(set, get, `Couldn't install ${pending.name}: ${result.error}`)
  },
  cancelFile: () => {
    const pending = get().pendingFile
    if (!pending) return
    set({ pendingFile: null })
    void window.api.appsDiscardPackage(pending.token)
  },
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

function pushEvent(set: (partial: Partial<StoreStoreState>) => void, get: () => StoreStoreState, text: string): void {
  set({ events: [...get().events, { id: `store-event-${++eventSeq}`, text }] })
}

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
  // A "from file" app counts as installed (Open / failed / restart) but never
  // gets Update: hasUpdate only looks at store installs.
  const installed = installedApp && installedApp.source !== 'dev' ? installedApp : undefined
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

// Handles vide://store links: once on mount (a link that arrived while this
// window was loading) and on every 'store:open' event. Returns the unsubscribe.
export function subscribeStoreOpen(): () => void {
  if (typeof window.api?.onStoreOpen !== 'function') return () => {}
  const take = () => {
    void window.api.storeTakePendingOpen().then((req) => {
      if (req) useStoreStore.getState().requestOpen(req.id)
    }).catch(() => {})
  }
  take()
  return window.api.onStoreOpen(take)
}

// Starts what the bell's update notices need: the catalog (if nothing loaded
// it yet) and the store:changed subscription.
export function startStoreUpdates(): void {
  if (typeof window.api?.storeGetRegistry !== 'function') return
  subscribeStoreChanged()
  if (!useStoreStore.getState().registry) void useStoreStore.getState().load(false)
}
