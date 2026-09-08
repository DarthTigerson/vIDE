import { describe, it, expect, beforeEach } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

import { vi } from 'vitest'
import { useBrowserFavoritesStore } from '../browserFavoritesStore'

describe('browserFavoritesStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useBrowserFavoritesStore.setState({ favorites: {} })
  })

  it('starts with no favorites', () => {
    expect(useBrowserFavoritesStore.getState().isFavorite('https://example.com')).toBe(false)
  })

  it('toggleFavorite adds a favorite with title and a timestamp, toggling again removes it', () => {
    useBrowserFavoritesStore.getState().toggleFavorite('https://example.com', 'Example Domain')
    const fav = useBrowserFavoritesStore.getState().favorites['https://example.com']
    expect(fav.title).toBe('Example Domain')
    expect(typeof fav.favoritedAt).toBe('number')

    useBrowserFavoritesStore.getState().toggleFavorite('https://example.com', 'Example Domain')
    expect(useBrowserFavoritesStore.getState().isFavorite('https://example.com')).toBe(false)
  })

  it('persists to localStorage and keeps other favorites independent', () => {
    useBrowserFavoritesStore.getState().toggleFavorite('https://a.com', 'A')
    useBrowserFavoritesStore.getState().toggleFavorite('https://b.com', 'B')

    const persisted = JSON.parse(localStorageStore['vide:browser:favorites'])
    expect(Object.keys(persisted)).toEqual(['https://a.com', 'https://b.com'])

    useBrowserFavoritesStore.getState().toggleFavorite('https://a.com', 'A')
    expect(useBrowserFavoritesStore.getState().isFavorite('https://a.com')).toBe(false)
    expect(useBrowserFavoritesStore.getState().isFavorite('https://b.com')).toBe(true)
  })
})
