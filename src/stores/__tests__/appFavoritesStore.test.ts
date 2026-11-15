// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('appFavoritesStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  async function loadStore() {
    return (await import('../appFavoritesStore'))
  }

  it('starts with Llama when nothing is stored', async () => {
    const { useAppFavoritesStore } = await loadStore()
    expect(useAppFavoritesStore.getState().favorites).toEqual(['llama'])
  })

  it('persists favoriting and unfavoriting', async () => {
    const { useAppFavoritesStore, APP_FAVORITES_KEY } = await loadStore()
    useAppFavoritesStore.getState().place('notes', 'llama', 'before')
    useAppFavoritesStore.getState().unfavorite('llama')
    expect(useAppFavoritesStore.getState().favorites).toEqual(['notes'])
    expect(JSON.parse(localStorage.getItem(APP_FAVORITES_KEY)!)).toEqual(['notes'])
  })

  it('carries a stored built-in Docker favorite over to the Docker store app', async () => {
    localStorage.setItem('vide:general:appFavorites', JSON.stringify(['notes', 'docker', 'llama']))
    const { useAppFavoritesStore } = await loadStore()
    expect(useAppFavoritesStore.getState().favorites).toEqual(['notes', 'app:docker', 'llama'])
  })

  it('picks up a change written by another window', async () => {
    const { useAppFavoritesStore, APP_FAVORITES_KEY } = await loadStore()
    localStorage.setItem(APP_FAVORITES_KEY, JSON.stringify(['scripts']))
    window.dispatchEvent(new StorageEvent('storage', { key: APP_FAVORITES_KEY }))
    expect(useAppFavoritesStore.getState().favorites).toEqual(['scripts'])
  })
})
