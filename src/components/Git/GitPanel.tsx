import { useEffect, useRef, useState } from 'react'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitFavoriteReposStore, sortReposByFavorite } from '@/stores/gitFavoriteReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { RepoOverviewList } from './RepoOverviewList'
import { RepoSection } from './RepoSection'

export function GitPanel() {
  const repos = useGitReposStore((s) => s.repos)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const selectRepo = useGitReposStore((s) => s.selectRepo)
  const favorites = useGitFavoriteReposStore((s) => s.favorites)
  const openRepos = useGitOpenReposStore((s) => s.open)
  const [showAllRepos, setShowAllRepos] = useState(false)

  // A single discovered repo has nothing to choose between — same bypass
  // as today's solo mode, just renamed now that it gates more than the
  // header (it also skips the open/close filtering below).
  const soloMode = repos.length <= 1
  const sortedRepos = sortReposByFavorite(repos, favorites)
  const openList = soloMode ? sortedRepos : sortedRepos.filter((repo) => openRepos[repo])

  const [pendingScrollTo, setPendingScrollTo] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!pendingScrollTo) return
    sectionRefs.current.get(pendingScrollTo)?.scrollIntoView({ block: 'start' })
    setPendingScrollTo(null)
  }, [pendingScrollTo, showAllRepos])

  // Only one repo's body is ever expanded at a time (RepoSection derives
  // isExpanded straight from selectedRepo), so selectedRepo must always
  // point at something in openList whenever anything is open — otherwise no
  // card would show as expanded at all. This repairs that invariant when it
  // was closed out from under the panel (e.g. "Close Repo" on the repo that
  // was currently active), falling back to another open repo rather than
  // leaving everything collapsed with no indication of what happened.
  useEffect(() => {
    if (soloMode || openList.length === 0) return
    if (!openList.includes(selectedRepo ?? '')) selectRepo(openList[0])
  }, [soloMode, openList, selectedRepo, selectRepo])

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Git Panel
        </span>
        {!soloMode && (
          <button
            type="button"
            onClick={() => setShowAllRepos((v) => !v)}
            className="text-[0.6875rem] text-fg-muted hover:text-fg transition-colors"
          >
            {showAllRepos ? 'Back to Repo' : 'Show All Repos'}
          </button>
        )}
      </div>

      {/* soloMode gates the overlay as well as the toggle button: if the repo
          count drops to 1 mid-session an already-open overview would be
          stranded with no way back. */}
      {showAllRepos && !soloMode ? (
        <RepoOverviewList onClose={(repo) => { setShowAllRepos(false); if (repo) setPendingScrollTo(repo) }} />
      ) : !soloMode && openList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-fg-subtle">
          No repos open. Use "Show All Repos" to open one.
        </div>
      ) : (
        <div className={soloMode ? 'flex-1 min-h-0 overflow-y-auto flex flex-col' : 'flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 py-2'}>
          {openList.map((repo) => (
            // Solo mode renders RepoSection as a bare fragment whose children
            // (commit box, flex-1 file list, footer) expect to be flex items of
            // this column, so this scroll-target wrapper has to be a
            // pass-through flex item there. Multi-repo sections size to their
            // content instead — the column above is what scrolls.
            <div
              key={repo}
              ref={(el) => { if (el) sectionRefs.current.set(repo, el); else sectionRefs.current.delete(repo) }}
              className={soloMode ? 'flex-1 min-h-0 flex flex-col' : undefined}
            >
              <RepoSection repo={repo} showHeader={!soloMode} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
