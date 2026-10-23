import React, { useCallback, useEffect, useState } from 'react'
import { APP_DRAG_MIME, hasBadge } from '@/components/ActivityBar/ActivityBar'
import { panelDropTargetClass } from '@/components/ui/panelDrop'
import { notifySettingChanged } from '@/lib/notifySettingChanged'
import { AllAppsContextMenu } from './AllAppsContextMenu'

export interface AllAppsEntry {
  id: string
  title: string
  icon: React.ReactNode
  favorite: boolean
  badge?: string | number
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void
  onSettings: () => void
  // Omitted for apps with no Enable switch.
  onDisable?: () => void
}

// An app whose Enable switch is off, listed in the collapsible Disabled
// section so it can be switched back on without a trip to Settings.
export interface DisabledAppEntry {
  id: string
  title: string
  icon: React.ReactNode
  onEnable: () => void
  onSettings: () => void
}

type ViewMode = 'list' | 'icons'
type DropZone = 'favorites' | 'others'

// Under 'vide:general:' so vIDE Sync carries it, like the favorites; it only
// changes on a click of the header toggle.
export const ALL_APPS_VIEW_KEY = 'vide:general:allAppsView'

// Whether the Disabled section is expanded; collapsed until first opened.
export const ALL_APPS_DISABLED_OPEN_KEY = 'vide:general:allAppsDisabledOpen'

function loadDisabledOpen(): boolean {
  try {
    return localStorage.getItem(ALL_APPS_DISABLED_OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

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
export function AllAppsPanel({ apps, disabledApps = [], open, onPlace, onUnfavorite }: {
  apps: AllAppsEntry[]
  disabledApps?: DisabledAppEntry[]
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
  const [disabledOpen, setDisabledOpenState] = useState(loadDisabledOpen)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    id: string
    onSettings: () => void
    onDisable?: () => void
    onEnable?: () => void
  } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  function openMenu(e: React.MouseEvent, app: AllAppsEntry) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, id: app.id, onSettings: app.onSettings, onDisable: app.onDisable })
  }

  function openDisabledMenu(e: React.MouseEvent, app: DisabledAppEntry) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, id: app.id, onSettings: app.onSettings, onEnable: app.onEnable })
  }

  function setDisabledOpen(value: boolean) {
    setDisabledOpenState(value)
    try { localStorage.setItem(ALL_APPS_DISABLED_OPEN_KEY, String(value)) } catch {}
    notifySettingChanged()
  }

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
  const favorites = visible.filter((app) => app.favorite)
  const others = visible.filter((app) => !app.favorite)
  const visibleDisabled = q ? disabledApps.filter((app) => app.title.toLowerCase().includes(q)) : disabledApps
  // A search shows matching disabled apps even while the section is collapsed.
  const disabledExpanded = disabledOpen || (q !== '' && visibleDisabled.length > 0)
  const favoriteIds = new Set(apps.filter((app) => app.favorite).map((app) => app.id))

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

  // The row a right-click menu is open for keeps its hover look, so it's
  // clear which app the menu acts on.
  function menuTargetClass(app: { id: string }) {
    return menu?.id === app.id ? 'text-fg bg-white/5' : 'text-fg-muted'
  }

  // Not draggable: a disabled app has to be enabled before it can go on the
  // bar. The icon is greyed out; a click turns the app back on.
  function renderDisabledApps(list: DisabledAppEntry[]) {
    const tile = 'bg-border text-fg-subtle opacity-60'
    if (viewMode === 'icons') {
      return (
        <div className="px-3 grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1">
          {list.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={app.onEnable}
              onContextMenu={(e) => openDisabledMenu(e, app)}
              className={`min-w-0 h-[4.75rem] px-1 rounded-md flex flex-col items-center justify-center gap-1.5 text-[0.6875rem] hover:text-fg hover:bg-white/5 transition-colors ${menuTargetClass(app)}`}
            >
              <span className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-[10px] [&>svg]:w-5 [&>svg]:h-5 ${tile}`}>{app.icon}</span>
              <span className="max-w-full truncate">{app.title}</span>
            </button>
          ))}
        </div>
      )
    }
    return list.map((app) => (
      <button
        key={app.id}
        type="button"
        onClick={app.onEnable}
        onContextMenu={(e) => openDisabledMenu(e, app)}
        className={`w-full h-9 pl-3 pr-2 flex items-center gap-2.5 text-left text-sm hover:text-fg hover:bg-white/5 transition-colors ${menuTargetClass(app)}`}
      >
        <span className={`shrink-0 flex items-center justify-center w-[1.625rem] h-[1.625rem] rounded-md [&>svg]:w-4 [&>svg]:h-4 ${tile}`}>{app.icon}</span>
        <span className="truncate">{app.title}</span>
      </button>
    ))
  }

  function renderApps(list: AllAppsEntry[], favorite: boolean) {
    const tile = favorite ? 'bg-accent/15 text-accent' : 'bg-border text-fg-muted'
    if (viewMode === 'icons') {
      return (
        // As many columns as the sidebar's width fits, so dragging it wider
        // or narrower reflows the tiles.
        <div className="px-3 grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1">
          {list.map((app) => (
            <button
              key={app.id}
              type="button"
              draggable
              onDragStart={(e) => startDrag(e, app.id)}
              onDragEnd={() => setDropZone(null)}
              onDrop={favorite ? (e) => dropOnFavorites(e, app.id) : undefined}
              onClick={app.onOpen}
              onContextMenu={(e) => openMenu(e, app)}
              className={`min-w-0 h-[4.75rem] px-1 rounded-md flex flex-col items-center justify-center gap-1.5 text-[0.6875rem] hover:text-fg hover:bg-white/5 transition-colors ${menuTargetClass(app)}`}
            >
              <AppIcon app={app} className={`w-10 h-10 rounded-[10px] [&>svg]:w-5 [&>svg]:h-5 ${tile}`} />
              <span className="max-w-full truncate">{app.title}</span>
            </button>
          ))}
        </div>
      )
    }
    return list.map((app) => (
      <button
        key={app.id}
        type="button"
        draggable
        onDragStart={(e) => startDrag(e, app.id)}
        onDragEnd={() => setDropZone(null)}
        onDrop={favorite ? (e) => dropOnFavorites(e, app.id) : undefined}
        onClick={app.onOpen}
        onContextMenu={(e) => openMenu(e, app)}
        className={`w-full h-9 pl-3 pr-2 flex items-center gap-2.5 text-left text-sm hover:text-fg hover:bg-white/5 transition-colors ${menuTargetClass(app)}`}
      >
        <AppIcon app={app} className={`w-[1.625rem] h-[1.625rem] rounded-md [&>svg]:w-4 [&>svg]:h-4 ${tile}`} />
        <span className="truncate">{app.title}</span>
      </button>
    ))
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
          className={`pb-1.5 shrink-0 ${dropZone === 'others' ? panelDropTargetClass : ''}`}
        >
          <SectionHeading title="More apps" count={others.length} />
          {others.length > 0
            ? renderApps(others, false)
            : q ? <p className="px-3 pb-1.5 text-xs text-fg-subtle">No apps match.</p> : null}
        </section>
        {visibleDisabled.length > 0 && (
          <>
            <div className="mx-3 h-px bg-border shrink-0" />
            <section aria-label="Disabled" className="pb-1.5 shrink-0">
              <button
                type="button"
                aria-expanded={disabledExpanded}
                onClick={() => setDisabledOpen(!disabledOpen)}
                className="w-full px-3 pt-2.5 pb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-muted hover:text-fg"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className={`transition-transform ${disabledExpanded ? 'rotate-90' : ''}`}>
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Disabled
                <span className="px-1.5 rounded-full bg-border text-fg-muted font-medium tracking-normal">{visibleDisabled.length}</span>
              </button>
              {disabledExpanded && renderDisabledApps(visibleDisabled)}
            </section>
          </>
        )}
      </div>
      {menu && (
        <AllAppsContextMenu
          x={menu.x}
          y={menu.y}
          onSettings={menu.onSettings}
          onDisable={menu.onDisable}
          onEnable={menu.onEnable}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

function startDrag(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(APP_DRAG_MIME, id)
  e.dataTransfer.effectAllowed = 'move'
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-muted">
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
