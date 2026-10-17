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

  it('starts with Docker and Llama when nothing is stored', async () => {
    const { useAppFavoritesStore } = await loadStore()
    expect(useAppFavoritesStore.getState().favorites).toEqual(['docker', 'llama'])
  })

  it('persists favoriting and unfavoriting', async () => {
    const { useAppFavoritesStore, APP_FAVORITES_KEY } = await loadStore()
    useAppFavoritesStore.getState().place('notes', 'docker', 'before')
    useAppFavoritesStore.getState().unfavorite('llama')
    expect(useAppFavoritesStore.getState().favorites).toEqual(['notes', 'docker'])
    expect(JSON.parse(localStorage.getItem(APP_FAVORITES_KEY)!)).toEqual(['notes', 'docker'])
  })

  it('picks up a change written by another window', async () => {
    const { useAppFavoritesStore, APP_FAVORITES_KEY } = await loadStore()
    localStorage.setItem(APP_FAVORITES_KEY, JSON.stringify(['jira']))
    window.dispatchEvent(new StorageEvent('storage', { key: APP_FAVORITES_KEY }))
    expect(useAppFavoritesStore.getState().favorites).toEqual(['jira'])
  })
})
