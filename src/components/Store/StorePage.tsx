import { useEffect, useState } from 'react'
import type { RegistryState, StoreListing } from '@/types/api'
import { useStoreStore } from '@/stores/storeStore'
import { hasUpdate as hasUpdateRule } from '@/lib/storeUpdates'
import { useAppContribStore } from '@/apps/appContribStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildStoreAppPath } from '@/components/Settings/paths'
import {
  DEFAULT_STORE_FILTERS, filterStoreApps, sortStoreApps, isDefaultStoreFilters, storeFilterCounts,
  type StoreFilters, type Category, type Maker,
} from '@/lib/storeFilter'
import { StoreAppRow } from './StoreAppRow'
import { AppMonogram, formatCheckedAgo, ghostPillClass } from './storeUi'

// The Store tab (store://Store), canvas board C: the vsuite.tech filters
// (Category, Made by, Applications) on the left, one app per row on the
// right. The Show group (All / Installed / Updates) filters by what is
// installed (appContribStore) and which installs have a newer listing.
export function StorePage() {
  const registry = useStoreStore((s) => s.registry)
  const loading = useStoreStore((s) => s.loading)
  const load = useStoreStore((s) => s.load)
  const openTab = useEditorStore((s) => s.openTab)
  const installedApps = useAppContribStore((s) => s.apps)
  const [filters, setFilters] = useState<StoreFilters>(DEFAULT_STORE_FILTERS)
  const [show, setShow] = useState<'all' | 'installed' | 'updates'>('all')

  // Show what the main process already has, then refresh in the background
  // so a reopened tab is instant but never stale for long.
  useEffect(() => {
    const hadRegistry = useStoreStore.getState().registry !== null
    void load(false).then(() => { if (hadRegistry) void load(true) })
  }, [load])

  const openApp = (id: string) => openTab({ path: buildStoreAppPath(id), content: '', dirty: false })
  const set = (patch: Partial<StoreFilters>) => setFilters((f) => ({ ...f, ...patch }))

  const all = registry?.status === 'ok' ? registry.apps : []
  const isInstalled = (a: StoreListing) => installedApps.some((i) => i.id === a.id && i.source === 'store')
  const hasUpdate = (a: StoreListing) => hasUpdateRule(a, installedApps.find((i) => i.id === a.id))
  const installedCount = all.filter(isInstalled).length
  const updatesCount = all.filter(hasUpdate).length
  const shown = show === 'installed' ? all.filter(isInstalled) : show === 'updates' ? all.filter(hasUpdate) : all
  const apps = sortStoreApps(filterStoreApps(shown, filters))
  const counts = storeFilterCounts(all)
  const vide = filters.targets.includes('vide')
  const devApps = installedApps.filter((a) => a.source === 'dev')

  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="px-10 py-8 flex flex-col gap-6 max-w-[1100px]">
        <header className="flex flex-wrap gap-4 items-end">
          <div className="flex-[1_1_240px] flex flex-col gap-1">
            <h1 className="text-[1.375rem] font-bold">vSuite Store</h1>
            <p className="text-[0.8125rem] text-fg-muted">Apps for vIDE. Install only what you use.</p>
          </div>
          <label className="flex-[0_1_320px] h-8 flex items-center gap-2 px-2.5 rounded-md border border-border bg-panel text-fg-subtle focus-within:border-accent/60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20.5 20.5" />
            </svg>
            <input
              aria-label="Search the store"
              placeholder="Search the store"
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              className="flex-1 min-w-0 bg-transparent text-fg text-xs outline-none"
            />
          </label>
        </header>

        <div className="flex flex-wrap gap-8 items-start">
          <aside aria-label="Filters" className="flex-[1_1_200px] max-w-[220px] flex flex-col gap-5">
            <FilterGroup
              title="Category"
              action={
                <button
                  type="button"
                  title="Clear filters"
                  aria-label="Clear filters"
                  disabled={isDefaultStoreFilters(filters)}
                  onClick={() => setFilters(DEFAULT_STORE_FILTERS)}
                  className="w-6 h-6 rounded flex items-center justify-center text-fg-subtle hover:text-accent hover:bg-white/5 disabled:opacity-40 disabled:hover:text-fg-subtle disabled:hover:bg-transparent"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 5h18l-7 8v5l-4 2v-7z" /><path d="M16 16l5 5M21 16l-5 5" />
                  </svg>
                </button>
              }
            >
              {([['all', 'All'], ['applications', 'Applications']] as [Category, string][]).map(([id, label]) => (
                <FilterRow key={id} label={label} count={counts.category[id]} active={filters.category === id} onClick={() => set({ category: id })} />
              ))}
            </FilterGroup>

            <FilterGroup title="Made by">
              {([['all', 'Everyone'], ['vsuite', 'Made by vSuite'], ['community', 'Community']] as [Maker, string][]).map(([id, label]) => (
                <FilterRow key={id} label={label} count={counts.maker[id]} active={filters.maker === id} onClick={() => set({ maker: id })} />
              ))}
            </FilterGroup>

            <FilterGroup title="Applications">
              <label className="flex items-center gap-2.5 px-2.5 text-xs text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={vide}
                  onChange={() => set({ targets: vide ? [] : ['vide'] })}
                  className="w-3.5 h-3.5 accent-accent"
                />
                vIDE
              </label>
            </FilterGroup>

            {(registry?.status === 'ok' || registry?.status === 'empty') && (
              <div className="flex items-center gap-2 text-[0.6875rem] text-fg-subtle">
                <p className="flex-1 leading-relaxed">
                  Catalog from vsuite.tech · checked {formatCheckedAgo(registry.checkedAt)}
                  {registry.status === 'ok' && registry.fromCache && ' (offline copy)'}
                </p>
                <button
                  type="button"
                  title="Check for new apps"
                  aria-label="Check for new apps"
                  disabled={loading}
                  onClick={() => void load(true)}
                  className="w-6 h-6 shrink-0 rounded flex items-center justify-center hover:text-fg hover:bg-white/5 disabled:opacity-40"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            )}
          </aside>

          <section aria-label="Apps" className="flex-[999_1_480px] min-w-0 flex flex-col gap-2">
            <div role="group" aria-label="Show" className="self-start mb-1.5 flex p-[3px] gap-0.5 rounded-lg border border-border bg-panel">
              <ShowButton active={show === 'all'} onClick={() => setShow('all')}>All <span className="opacity-70">{all.length}</span></ShowButton>
              <ShowButton active={show === 'installed'} onClick={() => setShow('installed')}>Installed <span className="opacity-70">{installedCount}</span></ShowButton>
              <ShowButton active={show === 'updates'} onClick={() => setShow('updates')}>Updates <span className="opacity-70">{updatesCount}</span></ShowButton>
            </div>

            <Body
              registry={registry}
              loading={loading}
              apps={apps}
              filtered={!isDefaultStoreFilters(filters) || show !== 'all'}
              onRetry={() => void load(true)}
              onOpenApp={openApp}
              onClear={() => { setFilters(DEFAULT_STORE_FILTERS); setShow('all') }}
            />

            {devApps.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">Loaded from folder</h2>
                {devApps.map((a) => (
                  <article key={a.id} className="bg-panel border border-dashed border-border rounded-[10px] px-4 py-3 flex items-center gap-4 min-w-0">
                    <AppMonogram name={a.name} />
                    <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
                      <h2 className="text-sm font-semibold text-fg truncate">{a.name}</h2>
                      <span className="text-[0.625rem] font-bold px-1.5 rounded bg-border text-fg-muted">Dev</span>
                    </div>
                    <span className="text-[0.6875rem] text-fg-subtle">{a.status === 'failed' ? 'Failed to load' : a.version}</span>
                  </article>
                ))}
              </div>
            )}

          </section>
        </div>
      </div>
    </div>
  )
}

function Body({ registry, loading, apps, filtered, onRetry, onOpenApp, onClear }: {
  registry: RegistryState | null
  loading: boolean
  apps: StoreListing[]
  filtered: boolean
  onRetry: () => void
  onOpenApp: (id: string) => void
  onClear: () => void
}) {
  if (!registry) {
    return <p className="text-xs text-fg-muted">{loading ? 'Loading the Store…' : ''}</p>
  }
  if (registry.status === 'too-new') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-fg">Update vIDE to use the Store</p>
        <p className="text-xs text-fg-muted">The Store's catalog needs a newer version of vIDE.</p>
      </div>
    )
  }
  if (registry.status === 'error') {
    return (
      <div className="flex flex-col gap-2 items-start">
        <p className="text-sm text-fg">{registry.message}</p>
        <button type="button" className={ghostPillClass} onClick={onRetry} disabled={loading}>
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    )
  }
  if (registry.status === 'empty') return <p className="text-xs text-fg-muted">No apps yet.</p>
  if (apps.length === 0) {
    return (
      <p className="text-xs text-fg-muted">
        No apps match.{' '}
        {filtered && <button type="button" className="text-accent hover:underline" onClick={onClear}>Clear filters</button>}
      </p>
    )
  }
  return (
    <>
      {apps.map((app) => (
        <StoreAppRow key={app.id} app={app} onOpen={() => onOpenApp(app.id)} />
      ))}
    </>
  )
}

function FilterGroup({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 mb-1 min-h-6">
        <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function FilterRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-[30px] px-2.5 rounded-md flex items-center justify-between text-xs transition-colors ${
        active ? 'bg-accent/15 text-accent font-medium' : 'text-fg-muted hover:text-fg hover:bg-white/5'
      }`}
    >
      {label}
      <span className={active ? '' : 'text-fg-subtle'}>{count}</span>
    </button>
  )
}

function ShowButton({ active, onClick, children }: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active ?? false}
      onClick={onClick}
      className={`h-[26px] px-2.5 rounded-md text-[0.6875rem] flex items-center gap-1.5 transition-colors ${
        active ? 'bg-accent/15 text-accent font-medium' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
