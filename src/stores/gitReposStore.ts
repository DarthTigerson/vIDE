import { create } from 'zustand'
import { useGitStore } from './gitStore'
import { useStatusMessageStore } from './statusMessageStore'
import { useGitFavoriteReposStore } from './gitFavoriteReposStore'
import { useGitOpenReposStore } from './gitOpenReposStore'

interface GitReposStore {
  repos: string[]
  selectedRepo: string | null
  // True once the user (via a repo's accordion section in the Git panel or
  // the "Show All Repos" overview) or auto-follow has actually picked a
  // repo — distinct from setRepos'
  // internal default-selection, which populates selectedRepo immediately on
  // project open purely so GitPanel/RepoOverviewList have data ready. The
  // footer uses this to stay silent in multi-repo projects until a repo has
  // genuinely been chosen, rather than showing the arbitrary first repo's
  // branch with no indication of which repo it belongs to.
  hasExplicitSelection: boolean
  setRepos: (repos: string[]) => void
  selectRepo: (repo: string) => void
  resolveRepoForPath: (absPath: string) => string | null
  followFilePath: (absPath: string) => void
}

export const useGitReposStore = create<GitReposStore>((set, get) => ({
  repos: [],
  selectedRepo: null,
  hasExplicitSelection: false,

  // Called once per project open/reload with the freshly discovered repo
  // list. Keeps the current selection if it's still valid (e.g. a
  // discovery re-run after a repo was added), otherwise falls back to the
  // first favorited repo (a deliberate signal from the user about which
  // repo they care about), or the first (sorted) repo if none are
  // favorited, or null if there are none. Always resets hasExplicitSelection
  // — a fresh project open means no repo has been explicitly chosen for it
  // yet, regardless of what the previous project left behind.
  setRepos: (repos) => {
    const current = get().selectedRepo
    const favorites = useGitFavoriteReposStore.getState().favorites
    const fallback = repos.find((repo) => favorites[repo]) ?? repos[0] ?? null
    const selectedRepo = current && repos.includes(current) ? current : fallback
    // setRepos only ever fires at a project-open/close boundary (see
    // fileStore.ts's discoverAndWatchRepos/closeProject) — never mid-session
    // for the same project — so unconditionally clearing the open set here
    // is exactly the "always starts empty" behavior the spec calls for.
    useGitOpenReposStore.getState().closeAll()
    set({ repos, selectedRepo, hasExplicitSelection: false })
  },

  selectRepo: (repo) => set({ selectedRepo: repo, hasExplicitSelection: true }),

  resolveRepoForPath: (absPath) => {
    let match: string | null = null
    for (const repo of get().repos) {
      if (absPath !== repo && !absPath.startsWith(`${repo}/`)) continue
      if (!match || repo.length > match.length) match = repo
    }
    return match
  },

  // The ONLY call site that should fire the "Switched to…" footer notice —
  // manual picks call selectRepo() directly and stay silent, since the click
  // itself is already the user's confirmation. Those are a RepoSection's own
  // action buttons (Branch/Graph/List Diff/Fetch/Pull/Push/Commit, which
  // point the panel-external Git Log, Graph and Branch-diff tabs at the repo
  // being acted on) and picking a row in the "Show All Repos" overview.
  followFilePath: (absPath) => {
    const repo = get().resolveRepoForPath(absPath)
    if (!repo) return
    // Unconditional, before the early-return below: the *first* file a user
    // opens usually resolves to the repo setRepos already auto-selected (its
    // favorite/first-repo fallback) — which is "selected" but not yet "open"
    // under the open/close model, so the already-selected path needs to open
    // it too, not just the switching path.
    useGitOpenReposStore.getState().openRepo(repo)
    // An open file within the already-selected repo (the common case, e.g.
    // the auto-selected first repo in a multi-repo project) still counts
    // as an explicit selection for the footer's purposes — there's just no
    // actual switch to notify about, so the toast stays silent.
    if (repo === get().selectedRepo) {
      if (!get().hasExplicitSelection) set({ hasExplicitSelection: true })
      return
    }
    set({ selectedRepo: repo, hasExplicitSelection: true })
    const name = repo.split('/').pop()
    const branch = useGitStore.getState().repos[repo]?.branch
    useStatusMessageStore.getState().show(branch ? `Switched to ${name} on ${branch}` : `Switched to ${name}`)
  },
}))
