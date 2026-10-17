import { useEffect, useRef, useState } from 'react'
import { useFileStore } from '@/stores/fileStore'
import type { RecentProject } from '@/types/api'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

interface Props {
  onClose: () => void
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

function scoreMatch(query: string, path: string): number {
  const name = basename(path).toLowerCase()
  if (name === query) return 3
  if (name.startsWith(query)) return 2
  if (name.includes(query)) return 1
  return 0
}

function filterRecents(recents: RecentProject[], query: string): RecentProject[] {
  const q = query.trim().toLowerCase()
  if (!q) return recents
  return recents
    .filter((r) => r.path.toLowerCase().includes(q))
    .sort((a, b) => scoreMatch(q, b.path) - scoreMatch(q, a.path))
}

export function RecentProjectsPalette({ onClose }: Props) {
  useCoverNativeViews()
  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = filterRecents(recents, query)
  const hasProject = useFileStore((s) => s.projectRoot !== null)

  useEffect(() => {
    window.api.recentProjectsList().then(setRecents)
    inputRef.current?.focus()
  }, [])

  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function openInCurrentWindow(path: string) {
    useFileStore.getState().openRecentProject(path)
    onClose()
  }

  function openInNewWindow(path: string) {
    window.api.openProjectInNewWindow(path)
    onClose()
  }

  // Never replaces the project open in this window: an already-open project
  // gets its window focused, anything else opens in a new window. Only a
  // window with no project yet loads it in place (no empty window left over).
  async function open(path: string) {
    if (await window.api.focusProjectIfOpen(path)) {
      onClose()
      return
    }
    if (useFileStore.getState().projectRoot) openInNewWindow(path)
    else openInCurrentWindow(path)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filtered[activeIndex]
      if (selected) open(selected.path)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[620px] max-h-[60vh] flex flex-col bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <FolderIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Switch project…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
        </div>

        {filtered.length > 0 && (
          <ul ref={listRef} className="overflow-y-auto flex-1 py-1">
            {filtered.map((recent, i) => {
              const isActive = i === activeIndex
              return (
                <li key={recent.path}>
                  <button
                    type="button"
                    onMouseDown={() => open(recent.path)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={[
                      'w-full flex flex-col px-4 py-2 text-left transition-colors',
                      isActive ? 'bg-accent/20' : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <span className={['text-sm font-medium', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                      {basename(recent.path)}
                    </span>
                    <span className="text-xs text-fg-subtle truncate">{recent.path}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {recents.length === 0 && (
          <div className="px-4 py-6 text-sm text-fg-subtle text-center">No recent projects</div>
        )}

        {recents.length > 0 && query.trim() && filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-fg-subtle text-center">No projects matching "{query}"</div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border shrink-0 text-xs text-fg-subtle">
            <span>↵ {hasProject ? 'open in new window' : 'open'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-fg-subtle shrink-0">
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}
