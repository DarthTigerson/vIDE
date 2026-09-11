import { create } from 'zustand'

const KEY = 'vide:git:expandedRepos'

function getExpanded(): Record<string, boolean> {
  // Guard against a missing global rather than throw at module-load time —
  // this store gets pulled transitively into node-environment unit tests
  // that never stub out localStorage. Mirrors gitFavoriteReposStore.ts.
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  if (!v) return {}
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

interface GitExpandedReposStore {
  expanded: Record<string, boolean>
  // A repo with no explicit stored value defaults to expanded only if it's
  // the currently-selected repo — this is a read-time fallback, never
  // written to storage, so opening a project never itself mutates it.
  isExpanded: (repo: string, selectedRepo: string | null) => boolean
  setExpanded: (repo: string, value: boolean) => void
}

// Keyed directly by absolute repo path, same reasoning as
// gitFavoriteReposStore: repo paths are already globally unique.
export const useGitExpandedReposStore = create<GitExpandedReposStore>((set, get) => ({
  expanded: getExpanded(),

  isExpanded: (repo, selectedRepo) => {
    const explicit = get().expanded[repo]
    return explicit !== undefined ? explicit : repo === selectedRepo
  },

  setExpanded: (repo, value) => {
    const next = { ...get().expanded, [repo]: value }
    localStorage.setItem(KEY, JSON.stringify(next))
    set({ expanded: next })
  },
}))
