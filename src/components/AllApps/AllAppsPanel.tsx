import React, { useEffect, useState } from 'react'
import { APP_DRAG_MIME } from '@/components/ActivityBar/ActivityBar'

export interface AllAppsEntry {
  id: string
  title: string
  icon: React.ReactNode
  favorite: boolean
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void
}

// The sidebar panel behind the activity bar's All Apps button: every enabled
// app, favorites included. The star on each row toggles whether it's on the
// bar; rows also drag onto the bar to favorite them, and a favorite dragged
// off the bar and dropped here is unfavorited.
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

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const q = query.trim().toLowerCase()
  const visible = q ? apps.filter((app) => app.title.toLowerCase().includes(q)) : apps
  const favoriteIds = new Set(apps.filter((app) => app.favorite).map((app) => app.id))

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
        // An unfavorited row dragged back onto this panel is a no-op.
        if (favoriteIds.has(id)) onUnfavorite(id)
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
          <div key={app.id} className="group h-8 pr-2 flex items-center hover:bg-white/5 transition-colors">
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(APP_DRAG_MIME, app.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={app.onOpen}
              className="flex-1 min-w-0 h-full pl-3 flex items-center gap-2.5 text-left text-sm text-fg-muted group-hover:text-fg"
            >
              <span className="w-5 h-5 shrink-0 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">{app.icon}</span>
              <span className="truncate">{app.title}</span>
            </button>
            <button
              type="button"
              aria-pressed={app.favorite}
              aria-label={app.favorite ? `Remove ${app.title} from favorites` : `Add ${app.title} to favorites`}
              title={app.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => (app.favorite ? onUnfavorite(app.id) : onFavorite(app.id))}
              className={[
                'w-6 h-6 shrink-0 rounded flex items-center justify-center hover:bg-white/10',
                app.favorite ? 'text-accent' : 'text-fg-subtle hover:text-fg',
              ].join(' ')}
            >
              <StarIcon filled={app.favorite} />
            </button>
          </div>
        ))}
        {visible.length === 0 && <p className="px-3 py-2 text-xs text-fg-subtle">No apps match.</p>}
      </div>
    </div>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.8l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
