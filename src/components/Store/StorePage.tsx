import { useEffect, useState } from 'react'
import type { RegistryState, StoreListing } from '@/types/api'
import { useStoreStore } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildStoreAppPath } from '@/components/Settings/paths'
import { openUrlInBrowserTab } from '@/components/Chat/terminalLinks'
import { StoreAppCard } from './StoreAppCard'
import { formatCheckedAgo, ghostPillClass } from './storeUi'

const STORE_SITE = 'https://vsuite.tech'

type Chip = 'all' | 'installed' | 'updates'

// The Store tab (store://Store), mockup board 1. Read-only until the app
// runtime lands: Installed/Updates chips are present but disabled.
export function StorePage() {
  const registry = useStoreStore((s) => s.registry)
  const loading = useStoreStore((s) => s.loading)
  const load = useStoreStore((s) => s.load)
  const openTab = useEditorStore((s) => s.openTab)
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<Chip>('all')

  // Show what the main process already has, then refresh in the background
  // so a reopened tab is instant but never stale for long.
  useEffect(() => {
    const hadRegistry = useStoreStore.getState().registry !== null
    void load(false).then(() => { if (hadRegistry) void load(true) })
  }, [load])

  const openApp = (id: string) => openTab({ path: buildStoreAppPath(id), content: '', dirty: false })

  const q = query.trim().toLowerCase()
  const apps = registry?.status === 'ok'
    ? registry.apps.filter((a) => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
    : []

  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="px-10 py-8 flex flex-col gap-5 max-w-[1100px]">
        <header className="flex flex-col gap-1">
          <h1 className="text-[1.375rem] font-bold">vSuite Store</h1>
          <p className="text-[0.8125rem] text-fg-muted">Apps for vIDE. Install only what you use.</p>
        </header>

        <div className="flex flex-wrap gap-2 items-center">
          <input
            aria-label="Search the store"
            placeholder="Search the store"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-[1_1_240px] max-w-[320px] h-7 rounded-md border border-border bg-panel text-fg text-xs px-2.5 outline-none focus:border-accent/60"
          />
          <ChipButton active={chip === 'all'} onClick={() => setChip('all')}>All</ChipButton>
          <ChipButton disabled title="Available once apps can be installed">Installed <span className="text-fg-subtle">0</span></ChipButton>
          <ChipButton disabled title="Available once apps can be installed">Updates <span className="text-fg-subtle">0</span></ChipButton>
        </div>

        <Body
          registry={registry}
          loading={loading}
          apps={apps}
          searching={q !== ''}
          onRetry={() => void load(true)}
          onOpenApp={openApp}
        />

        {(registry?.status === 'ok' || registry?.status === 'empty') && (
          <p className="text-[0.6875rem] text-fg-subtle">
            Catalog from vsuite.tech · checked {formatCheckedAgo(registry.checkedAt)}
            {registry.status === 'ok' && registry.fromCache && ' (offline copy)'}
          </p>
        )}
      </div>
    </div>
  )
}

function Body({ registry, loading, apps, searching, onRetry, onOpenApp }: {
  registry: RegistryState | null
  loading: boolean
  apps: StoreListing[]
  searching: boolean
  onRetry: () => void
  onOpenApp: (id: string) => void
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
  return (
    <>
      {registry.status === 'empty' && <p className="text-xs text-fg-muted">No apps yet.</p>}
      {registry.status === 'ok' && searching && apps.length === 0 && (
        <p className="text-xs text-fg-muted">No apps match.</p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
        {apps.map((app) => (
          <StoreAppCard key={app.id} app={app} onOpen={() => onOpenApp(app.id)} />
        ))}
        <article className="border border-dashed border-border rounded-[10px] p-4 flex flex-col gap-2 justify-center items-start">
          <h2 className="text-sm font-semibold text-fg-muted">Built something?</h2>
          <p className="text-xs text-fg-subtle leading-relaxed">
            Apps from other authors open later. They will be marked as not made by vIDE.
          </p>
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => openUrlInBrowserTab(STORE_SITE)}>
            vsuite.tech
          </button>
        </article>
      </div>
    </>
  )
}

function ChipButton({ active, disabled, title, onClick, children }: {
  active?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const look = active
    ? 'bg-accent/15 border-accent/40 text-accent'
    : 'border-border text-fg-muted hover:text-fg'
  return (
    <button
      type="button"
      aria-pressed={active ?? false}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`h-[26px] px-3 rounded-full border text-[0.6875rem] flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${look}`}
    >
      {children}
    </button>
  )
}
