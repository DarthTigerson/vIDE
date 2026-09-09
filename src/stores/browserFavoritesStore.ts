import { create } from 'zustand'

const KEY = 'vide:browser:favorites'

export interface BrowserFavorite {
  url: string
  title: string
  favoritedAt: number
}

function getFavorites(): Record<string, BrowserFavorite> {
  // Guard against a missing global rather than throw at module-load time —
  // this store can get pulled into node-environment unit tests that never
  // stub out localStorage.
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  if (!v) return {}
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

interface BrowserFavoritesStore {
  favorites: Record<string, BrowserFavorite>
  isFavorite: (url: string) => boolean
  toggleFavorite: (url: string, title: string) => void
}

export const useBrowserFavoritesStore = create<BrowserFavoritesStore>((set, get) => ({
  favorites: getFavorites(),

  isFavorite: (url) => !!get().favorites[url],

  toggleFavorite: (url, title) => {
    const next = { ...get().favorites }
    if (next[url]) {
      delete next[url]
    } else {
      next[url] = { url, title, favoritedAt: Date.now() }
    }
    localStorage.setItem(KEY, JSON.stringify(next))
    set({ favorites: next })
  },
}))
