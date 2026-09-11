import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'
import { useGitFavoriteReposStore, sortReposByFavorite } from '@/stores/gitFavoriteReposStore'
import { useGitExpandedReposStore } from '@/stores/gitExpandedReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { ContextMenuButton } from './ContextMenu'

export function StarIcon({ filled }: { filled: boolean }) {
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

function RepoRow({ repo, onSelect, onContextMenu }: {
  repo: string
  onSelect: (repo: string) => void
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
      onClick={() => onSelect(repo)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(repo) }}
      onContextMenu={(e) => onContextMenu(e, repo)}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors border-b border-border last:border-b-0 cursor-pointer"
    >
      <button
        type="button"
        aria-label={isFavorite ? `Unfavorite ${name}` : `Favorite ${name}`}
        aria-pressed={isFavorite}
        onClick={(e) => { e.stopPropagation(); toggleFavorite(repo) }}
        className={[
          'shrink-0 p-0.5 rounded transition-colors',
          isFavorite ? 'text-accent' : 'text-fg-subtle hover:text-fg-muted',
        ].join(' ')}
      >
        <StarIcon filled={isFavorite} />
      </button>
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

// Re-fetches every repo on each open rather than continuously polling
// repos that aren't selected — matches the refresh strategy in the design
// doc (only selectedRepo stays "live" via the git file watcher; this list
// is a point-in-time snapshot, refreshed on demand).
export function RepoOverviewList({ onClose }: Props) {
  const repos = useGitReposStore((s) => s.repos)
  const selectRepo = useGitReposStore((s) => s.selectRepo)
  const refresh = useGitStore((s) => s.refresh)
  const favorites = useGitFavoriteReposStore((s) => s.favorites)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [query, setQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    repos.forEach((repo) => refresh(repo))
    // Re-fetch every time this view mounts (i.e. every time it's opened),
    // not on every repos-array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleRepos = useMemo(() => {
    const sorted = sortReposByFavorite(repos, favorites)
    const needle = query.trim().toLowerCase()
    if (!needle) return sorted
    return sorted.filter((repo) => (repo.split('/').pop() ?? repo).toLowerCase().includes(needle))
  }, [repos, favorites, query])

  // "/" jumps straight into the filter box without needing to click first —
  // matches the convention in Gmail/GitHub/Slack list views. Only fires
  // when focus isn't already in a text field, so it doesn't eat a literal
  // "/" the user is typing into the box itself.
  function handleContainerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== '/') return
    const active = document.activeElement
    const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    if (isTyping) return
    event.preventDefault()
    searchRef.current?.focus()
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu])

  // Same clamp-after-measure approach as GitPanel's file context menu —
  // a hardcoded size guess at the click site can under-guess it and let
  // the menu overhang the window.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(menu.x, menu.y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menu])

  function handleSelect(repo: string) {
    selectRepo(repo)
    useGitExpandedReposStore.getState().setExpanded(repo, true)
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

  return (
    <div className="flex-1 flex flex-col min-h-0" tabIndex={-1} onKeyDown={handleContainerKeyDown}>
      <div className="p-1.5 border-b border-border shrink-0">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a repo (press / to search)"
          className="w-full h-6 rounded border border-border bg-bg px-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/50"
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur() } }}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {visibleRepos.length === 0 ? (
          <div className="px-3 py-3 text-xs text-fg-subtle">No repos found</div>
        ) : (
          visibleRepos.map((repo) => (
            <RepoRow key={repo} repo={repo} onSelect={handleSelect} onContextMenu={openContextMenu} />
          ))
        )}
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
