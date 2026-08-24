import { create } from 'zustand'

const KEY = 'vide:git:favoriteRepos'

function getFavorites(): Record<string, true> {
  // Guard against a missing global rather than throw at module-load time —
  // this store gets pulled transitively into node-environment unit tests
  // (via gitReposStore/GitPanel imports) that never stub out localStorage.
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  if (!v) return {}
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

interface GitFavoriteReposStore {
  favorites: Record<string, true>
  isFavorite: (repo: string) => boolean
  toggleFavorite: (repo: string) => void
}

// Keyed directly by absolute repo path rather than scoped per project root —
// repo paths are already globally unique, and a favorite staying set if the
// same repo reappears under a different opened project is the expected
// behavior, not a bug.
export const useGitFavoriteReposStore = create<GitFavoriteReposStore>((set, get) => ({
  favorites: getFavorites(),

  isFavorite: (repo) => !!get().favorites[repo],

  toggleFavorite: (repo) => {
    const next = { ...get().favorites }
    if (next[repo]) {
      delete next[repo]
    } else {
      next[repo] = true
    }
    localStorage.setItem(KEY, JSON.stringify(next))
    set({ favorites: next })
  },
}))

// Favorites first (alphabetical within each group), then the rest
// (alphabetical) — shared by RepoSelect and RepoOverviewList so both sort
// consistently.
export function sortReposByFavorite(repos: string[], favorites: Record<string, true>): string[] {
  return [...repos].sort((a, b) => {
    const favA = !!favorites[a]
    const favB = !!favorites[b]
    if (favA !== favB) return favA ? -1 : 1
    return a.localeCompare(b)
  })
}
