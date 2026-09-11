import { useEffect, useRef, useState } from 'react'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitFavoriteReposStore, sortReposByFavorite } from '@/stores/gitFavoriteReposStore'
import { RepoOverviewList } from './RepoOverviewList'
import { RepoSection } from './RepoSection'

export function GitPanel() {
  const repos = useGitReposStore((s) => s.repos)
  const favorites = useGitFavoriteReposStore((s) => s.favorites)
  const [showAllRepos, setShowAllRepos] = useState(false)
  const sortedRepos = sortReposByFavorite(repos, favorites)
  const showHeader = repos.length > 1

  const [pendingScrollTo, setPendingScrollTo] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!pendingScrollTo) return
    sectionRefs.current.get(pendingScrollTo)?.scrollIntoView({ block: 'start' })
    setPendingScrollTo(null)
  }, [pendingScrollTo, showAllRepos])

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Git Panel
        </span>
        {showHeader && (
          <button
            type="button"
            onClick={() => setShowAllRepos((v) => !v)}
            className="text-[0.6875rem] text-fg-muted hover:text-fg transition-colors"
          >
            {showAllRepos ? 'Back to Repo' : 'Show All Repos'}
          </button>
        )}
      </div>

      {showAllRepos ? (
        <RepoOverviewList onClose={(repo) => { setShowAllRepos(false); if (repo) setPendingScrollTo(repo) }} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {sortedRepos.map((repo) => (
            <div key={repo} ref={(el) => { if (el) sectionRefs.current.set(repo, el); else sectionRefs.current.delete(repo) }}>
              <RepoSection repo={repo} showHeader={showHeader} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
