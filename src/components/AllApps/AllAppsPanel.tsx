import React, { useEffect, useState } from 'react'
import { APP_DRAG_MIME } from '@/components/ActivityBar/ActivityBar'
import { AppFavoriteContextMenu } from './AppFavoriteContextMenu'

export interface AllAppsEntry {
  id: string
  title: string
  icon: React.ReactNode
  onOpen: () => void
}

// The sidebar panel behind the activity bar's All Apps button: every enabled
// app that isn't a favorite. Rows drag onto the bar to favorite them; a
// favorite dragged off the bar and dropped here is unfavorited.
export function AllAppsPanel({ apps, open, onFavorite, onUnfavorite }: {
  apps: AllAppsEntry[]
  // False while the sidebar shows another panel (or is collapsed) — the
  // search is cleared then, so it's fresh every time the panel opens.
  open: boolean
  onFavorite: (id: string) => void
  onUnfavorite: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const q = query.trim().toLowerCase()
  const visible = q ? apps.filter((app) => app.title.toLowerCase().includes(q)) : apps
  const appIds = new Set(apps.map((app) => app.id))

  return (
    <div
      className={['h-full flex flex-col bg-sidebar', dropActive ? 'ring-1 ring-inset ring-accent' : ''].join(' ')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(APP_DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropActive(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropActive(false)
        const id = e.dataTransfer.getData(APP_DRAG_MIME)
        // A row dragged and dropped back onto this panel is a no-op.
        if (id && !appIds.has(id)) onUnfavorite(id)
      }}
    >
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">All Apps</span>
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
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {visible.map((app) => (
          <button
            key={app.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(APP_DRAG_MIME, app.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={app.onOpen}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ id: app.id, x: e.clientX, y: e.clientY })
            }}
            className="w-full h-8 px-3 flex items-center gap-2.5 text-left text-sm text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">{app.icon}</span>
            <span className="truncate">{app.title}</span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-2 text-xs text-fg-subtle">
            {apps.length === 0 ? 'Every app is a favorite.' : 'No apps match.'}
          </p>
        )}
      </div>
      {menu && (
        <AppFavoriteContextMenu
          x={menu.x}
          y={menu.y}
          favorite={false}
          onToggle={() => onFavorite(menu.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
