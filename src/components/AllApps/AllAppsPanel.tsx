import React, { useEffect, useState } from 'react'
import { APP_DRAG_MIME, hasBadge, SettingsIcon } from '@/components/ActivityBar/ActivityBar'
import { ConfirmActionModal } from '@/components/Git/ConfirmActionModal'
import { panelDropTargetClass } from '@/components/ui/panelDrop'
import { notifySettingChanged } from '@/lib/notifySettingChanged'

export interface AllAppsEntry {
  id: string
  title: string
  icon: React.ReactNode
  favorite: boolean
  badge?: string | number
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void
  onOpenSettings: () => void
  // Switched off in its settings: listed under "Disabled" instead of the
  // bar sections, and clicking it offers to switch it back on.
  disabled?: boolean
  // Unset for apps with no enable switch (Open GitLab/GitHub shows whenever
  // a remote URL is set), which get no power button.
  onSetEnabled?: (enabled: boolean) => void
}

type ViewMode = 'list' | 'icons'
type DropZone = 'favorites' | 'others'

// Under 'vide:general:' so vIDE Sync carries it, like the favorites; it only
// changes on a click of the header toggle.
export const ALL_APPS_VIEW_KEY = 'vide:general:allAppsView'

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(ALL_APPS_VIEW_KEY) === '"icons"' ? 'icons' : 'list'
  } catch {
    return 'list'
  }
}

// The sidebar panel behind the activity bar's All Apps button: every enabled
// app, split into "On the bar" (the favorites, in bar order) and "More apps".
// Dragging a row between the sections favorites or unfavorites it, dropping
// onto a favorite places the app before it, and a favorite dragged off the
// bar and dropped anywhere outside "On the bar" is unfavorited.
export function AllAppsPanel({ apps, open, onPlace, onUnfavorite }: {
  apps: AllAppsEntry[]
  // False while the sidebar shows another panel (or is collapsed) — the
  // search is cleared then, so it's fresh every time the panel opens.
  open: boolean
  // beforeId null = append to the end of the favorites.
  onPlace: (id: string, beforeId: string | null) => void
  onUnfavorite: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const [viewMode, setViewModeState] = useState<ViewMode>(loadViewMode)
  const [disabledOpen, setDisabledOpen] = useState(false)
  const [confirming, setConfirming] = useState<AllAppsEntry | null>(null)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode)
    try { localStorage.setItem(ALL_APPS_VIEW_KEY, JSON.stringify(mode)) } catch {}
    notifySettingChanged()
  }

  const q = query.trim().toLowerCase()
  const visible = q ? apps.filter((app) => app.title.toLowerCase().includes(q)) : apps
  const favorites = visible.filter((app) => !app.disabled && app.favorite)
  const others = visible.filter((app) => !app.disabled && !app.favorite)
  const disabledApps = visible.filter((app) => app.disabled)
  const anyDisabled = apps.some((app) => app.disabled)
  // A search that matches a disabled app shows it without having to expand.
  const showDisabled = disabledOpen || (q !== '' && disabledApps.length > 0)
  const favoriteIds = new Set(apps.filter((app) => !app.disabled && app.favorite).map((app) => app.id))

  function zoneHandlers(zone: DropZone) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(APP_DRAG_MIME)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDropZone(zone)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropZone(null)
      },
    }
  }

  function dropOnFavorites(e: React.DragEvent, beforeId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    setDropZone(null)
    const id = e.dataTransfer.getData(APP_DRAG_MIME)
    if (id && id !== beforeId) onPlace(id, beforeId)
  }

  // Everywhere outside "On the bar": a favorite dropped here comes off the
  // bar; an unfavorited row dropped back is a no-op.
  function dropElsewhere(e: React.DragEvent) {
    e.preventDefault()
    setDropZone(null)
    const id = e.dataTransfer.getData(APP_DRAG_MIME)
    if (favoriteIds.has(id)) onUnfavorite(id)
  }

  function renderApps(list: AllAppsEntry[], favorite: boolean) {
    const tile = favorite ? 'bg-accent/15 text-accent' : 'bg-border text-fg-muted'
    if (viewMode === 'icons') {
      return (
        // As many columns as the sidebar's width fits, so dragging it wider
        // or narrower reflows the tiles.
        <div className="px-3 grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1">
          {list.map((app) => (
            <div key={app.id} className={`group relative min-w-0 ${app.disabled ? 'opacity-50 hover:opacity-100 focus-within:opacity-100' : ''}`}>
              <button
                type="button"
                {...rowProps(app, favorite)}
                className="w-full h-[4.75rem] px-1 rounded-md flex flex-col items-center justify-center gap-1.5 text-[0.6875rem] text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
              >
                <AppIcon app={app} className={`w-10 h-10 rounded-[10px] [&>svg]:w-5 [&>svg]:h-5 ${tile}`} />
                <span className="max-w-full truncate">{app.title}</span>
              </button>
              <RowActions app={app} onToggle={() => setConfirming(app)} className="absolute top-0.5 right-0.5" />
            </div>
          ))}
        </div>
      )
    }
    return list.map((app) => (
      <div key={app.id} className={`group relative flex items-center hover:bg-white/5 ${app.disabled ? 'opacity-50 hover:opacity-100 focus-within:opacity-100' : ''}`}>
        <button
          type="button"
          {...rowProps(app, favorite)}
          className="flex-1 min-w-0 h-9 pl-3 pr-2 flex items-center gap-2.5 text-left text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <AppIcon app={app} className={`w-[1.625rem] h-[1.625rem] rounded-md [&>svg]:w-4 [&>svg]:h-4 ${tile}`} />
          <span className="truncate">{app.title}</span>
        </button>
        <RowActions app={app} onToggle={() => setConfirming(app)} className="pr-2" />
      </div>
    ))
  }

  // A disabled app isn't on the bar, so it can't be dragged there, and
  // clicking it offers to switch it back on rather than opening it.
  function rowProps(app: AllAppsEntry, favorite: boolean) {
    if (app.disabled) {
      return { onClick: () => (app.onSetEnabled ? setConfirming(app) : app.onOpenSettings()) }
    }
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => startDrag(e, app.id),
      onDragEnd: () => setDropZone(null),
      onDrop: favorite ? (e: React.DragEvent) => dropOnFavorites(e, app.id) : undefined,
      onClick: app.onOpen,
    }
  }

  return (
    <div
      className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(APP_DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropZone('others')
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropZone(null)
      }}
      onDrop={dropElsewhere}
    >
      <div className="h-9 pl-3 pr-1.5 border-b border-border shrink-0 flex items-center gap-0.5">
        <span className="flex-1 text-xs font-semibold text-fg-muted uppercase tracking-wider">All Apps</span>
        <ViewModeButton label="List" active={viewMode === 'list'} onClick={() => setViewMode('list')}>
          <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
        </ViewModeButton>
        <ViewModeButton label="Icons" active={viewMode === 'icons'} onClick={() => setViewMode('icons')}>
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" strokeLinejoin="round" />
        </ViewModeButton>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            className="w-full h-7 rounded border border-border bg-bg pl-2 pr-6 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-fg-subtle hover:text-fg hover:bg-white/10"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <section
          aria-label="On the bar"
          {...zoneHandlers('favorites')}
          onDrop={(e) => dropOnFavorites(e, null)}
          className={`pb-1.5 shrink-0 ${dropZone === 'favorites' ? panelDropTargetClass : ''}`}
        >
          <SectionHeading title="On the bar" count={favorites.length} />
          {favorites.length > 0
            ? renderApps(favorites, true)
            : <p className="px-3 pb-1.5 text-xs text-fg-subtle">{q ? 'No apps match.' : 'Drag an app here to add it to the bar.'}</p>}
        </section>
        <div className="mx-3 h-px bg-border shrink-0" />
        <section
          aria-label="More apps"
          {...zoneHandlers('others')}
          onDrop={(e) => { e.stopPropagation(); dropElsewhere(e) }}
          className={`flex-1 pb-1.5 ${dropZone === 'others' ? panelDropTargetClass : ''}`}
        >
          <SectionHeading title="More apps" count={others.length} />
          {others.length > 0
            ? renderApps(others, false)
            : q ? <p className="px-3 pb-1.5 text-xs text-fg-subtle">No apps match.</p> : null}
        </section>
        {anyDisabled && (
          <section aria-label="Disabled" className="pb-1.5 shrink-0">
            <div className="mx-3 h-px bg-border" />
            <button
              type="button"
              aria-expanded={showDisabled}
              onClick={() => setDisabledOpen((v) => !v)}
              className="w-full text-left hover:bg-white/5"
            >
              <SectionHeading title="Disabled" count={disabledApps.length} chevron={showDisabled ? 'open' : 'closed'} />
            </button>
            {showDisabled && renderApps(disabledApps, false)}
          </section>
        )}
      </div>
      {confirming && (
        <ConfirmActionModal
          title={`${confirming.disabled ? 'Enable' : 'Disable'} ${confirming.title}?`}
          message={confirming.disabled
            ? `${confirming.title} will be switched back on${confirming.favorite ? ' and return to the bar' : ''}.`
            : `${confirming.title} will be switched off and taken off the bar. You can enable it again from the Disabled section here or from its settings.`}
          confirmLabel={confirming.disabled ? 'Enable' : 'Disable'}
          danger={!confirming.disabled}
          onConfirm={() => confirming.onSetEnabled?.(!!confirming.disabled)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

// The settings cog and, for apps that have one, the enable/disable switch.
// Hidden until the row is hovered or focused, so the list stays quiet.
function RowActions({ app, onToggle, className }: { app: AllAppsEntry; onToggle: () => void; className: string }) {
  return (
    <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${className}`}>
      {app.onSetEnabled && (
        <RowActionButton label={`${app.disabled ? 'Enable' : 'Disable'} ${app.title}`} onClick={onToggle}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0" />
          </svg>
        </RowActionButton>
      )}
      <RowActionButton label={`${app.title} settings`} onClick={app.onOpenSettings}>
        <span className="[&>svg]:w-3 [&>svg]:h-3 flex"><SettingsIcon /></span>
      </RowActionButton>
    </div>
  )
}

function RowActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="w-5 h-5 rounded flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-white/10"
    >
      {children}
    </button>
  )
}

function startDrag(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(APP_DRAG_MIME, id)
  e.dataTransfer.effectAllowed = 'move'
}

function SectionHeading({ title, count, chevron }: { title: string; count: number; chevron?: 'open' | 'closed' }) {
  return (
    <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-muted">
      {chevron && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className={`-mr-1 transition-transform ${chevron === 'open' ? 'rotate-90' : ''}`}>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {title}
      <span className="px-1.5 rounded-full bg-border text-fg-muted font-medium tracking-normal">{count}</span>
    </div>
  )
}

// The app's icon on a tinted square, with its badge on the bottom-right
// corner the same way the activity bar shows it.
function AppIcon({ app, className }: { app: AllAppsEntry; className: string }) {
  return (
    <span className={`relative shrink-0 flex items-center justify-center ${className}`}>
      {app.icon}
      {hasBadge(app.badge) && (
        <span className="absolute -right-1.5 -bottom-1 min-w-3.5 h-3.5 rounded-full bg-accent px-0.5 text-center text-[0.5rem] font-bold leading-[0.875rem] text-on-accent shadow shadow-black/40">
          {app.badge}
        </span>
      )}
    </span>
  )
}

function ViewModeButton({ label, active, onClick, children }: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'w-6 h-6 rounded flex items-center justify-center',
        active ? 'bg-white/10 text-fg' : 'text-fg-subtle hover:text-fg hover:bg-white/5',
      ].join(' ')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}
