import { create } from 'zustand'

interface GitOpenReposStore {
  // Deliberately NOT persisted to localStorage, unlike gitFavoriteReposStore/
  // gitExpandedReposStore: the open set must always reset to empty on a
  // fresh project open (see gitReposStore.setRepos), never survive a
  // restart.
  open: Record<string, true>
  isOpen: (repo: string) => boolean
  openRepo: (repo: string) => void
  closeRepo: (repo: string) => void
  closeAll: () => void
}

export const useGitOpenReposStore = create<GitOpenReposStore>((set, get) => ({
  open: {},

  isOpen: (repo) => !!get().open[repo],

  openRepo: (repo) => {
    if (get().open[repo]) return
    set({ open: { ...get().open, [repo]: true } })
  },

  closeRepo: (repo) => {
    if (!get().open[repo]) return
    const next = { ...get().open }
    delete next[repo]
    set({ open: next })
  },

  // Also called internally by gitReposStore.setRepos on every fresh
  // project-open boundary — one bulk-clear serves both callers.
  closeAll: () => set({ open: {} }),
}))
