import { useGitStore, useRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitFavoriteReposStore, sortReposByFavorite } from '@/stores/gitFavoriteReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSearchStore } from '@/stores/searchStore'
import type { GitCommandAction } from '@/types/index'

interface Props {
  onClose: () => void
  onRequestForce: (action: ForceAction) => void
}

type ForceAction = Extract<GitCommandAction, 'forcePush' | 'forcePushLease'>

export function GitActionsMenu({ onClose, onRequestForce }: Props) {
  const repos = useGitReposStore((s) => s.repos)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const selectRepo = useGitReposStore((s) => s.selectRepo)
  const favorites = useGitFavoriteReposStore((s) => s.favorites)
  const openRepoSet = useGitOpenReposStore((s) => s.open)
  const { branch, commandStatus } = useRepoGitState(selectedRepo)
  const fetch = useGitStore((s) => s.fetch)
  const pull = useGitStore((s) => s.pull)
  const push = useGitStore((s) => s.push)
  const publishBranch = useGitStore((s) => s.publishBranch)

  const disabled = commandStatus === 'running' || !selectedRepo
  // Quick-switch list mirrors the Git panel's own open set (same sort order,
  // favorites first) — those are the repos the user is actually working on
  // right now, and picking one here just moves the panel's single-expand
  // accordion over to it, same as clicking its header would.
  const openRepos = sortReposByFavorite(repos.filter((repo) => openRepoSet[repo]), favorites)

  async function run(action: () => Promise<void>) {
    onClose()
    await action()
  }

  function handleSelectRepo(repo: string) {
    // StatusBar's own effect re-fetches branch/status for whatever repo
    // becomes selected, so passive (not-yet-loaded) repos still end up
    // fresh here without this menu needing to trigger that itself.
    selectRepo(repo)
    onClose()
  }

  function handleSwitchBranch() {
    onClose()
    useSearchStore.getState().openBranchPalette()
  }

  function handlePublishBranch() {
    if (!selectedRepo || !branch) return
    onClose()
    publishBranch(selectedRepo, branch)
  }

  function handleForce(action: ForceAction) {
    onClose()
    onRequestForce(action)
  }

  const itemClass =
    'w-full rounded text-left px-2 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="absolute bottom-full left-0 mb-1 w-56 max-h-[70vh] overflow-y-auto rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50 z-50">
      {repos.length > 1 && openRepos.length > 0 && (
        <>
          <div className="px-2 pt-1 pb-0.5 text-[0.625rem] font-semibold text-fg-subtle uppercase tracking-wider">
            Open Repos
          </div>
          {openRepos.map((repo) => (
            <button
              key={repo}
              type="button"
              className={[itemClass, 'truncate', repo === selectedRepo ? 'text-fg font-semibold' : 'text-fg-muted'].join(' ')}
              onClick={() => handleSelectRepo(repo)}
            >
              {repo.split('/').pop()}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
        </>
      )}

      <button type="button" className={itemClass} disabled={!selectedRepo} onClick={handleSwitchBranch}>
        Switch Branch…
      </button>
      <div className="my-1 h-px bg-border" />
      <button type="button" className={itemClass} disabled={disabled}
        onClick={() => run(() => fetch(selectedRepo!))}>
        Fetch
      </button>
      <button type="button" className={itemClass} disabled={disabled}
        onClick={() => run(() => pull(selectedRepo!))}>
        Pull
      </button>
      <div className="my-1 h-px bg-border" />
      <button type="button" className={itemClass} disabled={disabled}
        onClick={() => run(() => push(selectedRepo!))}>
        Push
      </button>
      <button
        type="button"
        className={itemClass}
        disabled={disabled || !branch}
        title={branch ? `git push -u origin ${branch}` : undefined}
        onClick={handlePublishBranch}
      >
        Publish Branch
      </button>
      <button type="button" className={`${itemClass} text-red-400`} disabled={disabled}
        onClick={() => handleForce('forcePush')}>
        Force Push
      </button>
      <button type="button" className={`${itemClass} text-red-400`} disabled={disabled}
        onClick={() => handleForce('forcePushLease')}>
        Force Push with Lease
      </button>
    </div>
  )
}
