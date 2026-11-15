import { create } from 'zustand'
import { notifySettingChanged } from '../lib/notifySettingChanged'
import {
  placeFavorite,
  removeFavorite,
  sanitizeFavorites,
  type FavoriteId,
} from '../lib/appFavorites'

// Under 'vide:general:' so vIDE Sync carries it between machines. It only
// changes when the user rearranges the bar, so it can't add a commit on
// every periodic push.
export const APP_FAVORITES_KEY = 'vide:general:appFavorites'

function load(): FavoriteId[] {
  try {
    const raw = localStorage.getItem(APP_FAVORITES_KEY)
    return sanitizeFavorites(raw === null ? null : JSON.parse(raw))
  } catch {
    return sanitizeFavorites(null)
  }
}

interface AppFavoritesStore {
  favorites: FavoriteId[]
  place: (id: string, targetId: string, placement: 'before' | 'after') => void
  unfavorite: (id: string) => void
}

export const useAppFavoritesStore = create<AppFavoritesStore>((set, get) => {
  function save(favorites: FavoriteId[]) {
    if (favorites === get().favorites) return
    try { localStorage.setItem(APP_FAVORITES_KEY, JSON.stringify(favorites)) } catch {}
    set({ favorites })
    notifySettingChanged()
  }
  return {
    favorites: load(),
    place: (id, targetId, placement) => save(placeFavorite(get().favorites, id, targetId, placement)),
    unfavorite: (id) => save(removeFavorite(get().favorites, id)),
  }
})

// Other windows share this localStorage; the 'storage' event fires in every
// window except the one that wrote, so each picks up the change live.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== APP_FAVORITES_KEY) return
    useAppFavoritesStore.setState({ favorites: load() })
  })
}
