import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'
import { useGitFavoriteReposStore, sortReposByFavorite } from '@/stores/gitFavoriteReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { ContextMenuButton } from './ContextMenu'

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" />
    </svg>
  )
}

interface Props {
  onClose: (repo?: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  repo: string
}

function RepoRow({ repo, active, onSelect, onHover, onContextMenu }: {
  repo: string
  active: boolean
  onSelect: (repo: string) => void
  onHover: () => void
  onContextMenu: (event: MouseEvent, repo: string) => void
}) {
  const { branch, status, aheadBehind } = useRepoGitState(repo)
  const isFavorite = useGitFavoriteReposStore((s) => s.isFavorite(repo))
  const toggleFavorite = useGitFavoriteReposStore((s) => s.toggleFavorite)
  const name = repo.split('/').pop()

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={() => onSelect(repo)}
      onMouseEnter={onHover}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(repo) }}
      onContextMenu={(e) => onContextMenu(e, repo)}
      className={[
        'w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors cursor-pointer',
        active ? 'bg-accent/20' : 'hover:bg-white/5',
      ].join(' ')}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={isFavorite ? `Unfavorite ${name}` : `Favorite ${name}`}
        aria-pressed={isFavorite}
        onMouseDown={(e) => { e.stopPropagation(); toggleFavorite(repo) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(repo) } }}
        className={[
          'shrink-0 p-0.5 rounded transition-colors',
          isFavorite ? 'text-accent' : 'text-fg-subtle hover:text-fg-muted',
        ].join(' ')}
      >
        <StarIcon filled={isFavorite} />
      </span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-fg">{name}</span>
        <span className="truncate text-xs text-fg-muted">{branch ?? '—'}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0 text-xs text-fg-muted tabular-nums">
        {aheadBehind && (
          <span className="flex items-center gap-1">
            <span>↓{aheadBehind.behind}</span>
            <span>↑{aheadBehind.ahead}</span>
          </span>
        )}
        <span>{status.staged.length + status.unstaged.length}</span>
      </span>
    </div>
  )
}

// Re-fetches every repo on each open rather than continuously polling repos
// that aren't selected — matches RepoOverviewList's old refresh strategy:
// only selectedRepo stays "live" via the git file watcher, this palette is a
// point-in-time snapshot, refreshed on demand.
export function RepoPalette({ onClose }: Props) {
  const repos = useGitReposStore((s) => s.repos)
  const selectRepo = useGitReposStore((s) => s.selectRepo)
  const refresh = useGitStore((s) => s.refresh)
  const favorites = useGitFavoriteReposStore((s) => s.favorites)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    repos.forEach((repo) => refresh(repo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const visibleRepos = useMemo(() => {
    const sorted = sortReposByFavorite(repos, favorites)
    const needle = query.trim().toLowerCase()
    if (!needle) return sorted
    return sorted.filter((repo) => (repo.split('/').pop() ?? repo).toLowerCase().includes(needle))
  }, [repos, favorites, query])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const closeOnEscape = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu])

  // Same clamp-after-measure approach as the Git panel's own context menus —
  // a hardcoded size guess at the click site can under-guess it and let the
  // menu overhang the window.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(menu.x, menu.y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menu])

  function handleSelect(repo: string) {
    selectRepo(repo)
    useGitOpenReposStore.getState().openRepo(repo)
    onClose(repo)
  }

  function openContextMenu(event: MouseEvent, repo: string) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, repo })
  }

  function goToFileTree(repo: string) {
    useSidebarUiStore.getState().requestReveal(repo, true)
    onClose()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, visibleRepos.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const repo = visibleRepos[activeIndex]
      if (repo) handleSelect(repo)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] max-h-[60vh] flex flex-col bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Find a repo…"
          className="w-full bg-transparent px-4 py-3 border-b border-border text-sm text-fg placeholder:text-fg-subtle outline-none"
        />
        <div ref={listRef} className="overflow-y-auto flex-1 py-1">
          {visibleRepos.length === 0 ? (
            <div className="px-4 py-6 text-sm text-fg-subtle text-center">
              No repos matching "{query}"
            </div>
          ) : (
            visibleRepos.map((repo, i) => (
              <RepoRow
                key={repo}
                repo={repo}
                active={i === activeIndex}
                onSelect={handleSelect}
                onHover={() => setActiveIndex(i)}
                onContextMenu={openContextMenu}
              />
            ))
          )}
        </div>
      </div>

      {menu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenuButton onClick={() => { goToFileTree(menu.repo); setMenu(null) }}>
            Go to File Tree
          </ContextMenuButton>
        </div>,
        document.body
      )}
    </div>
  )
}
