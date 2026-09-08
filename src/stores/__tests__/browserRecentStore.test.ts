import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

import { useBrowserRecentStore } from '../browserRecentStore'

describe('browserRecentStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useBrowserRecentStore.setState({ entries: [] })
  })

  it('starts empty', () => {
    expect(useBrowserRecentStore.getState().entries).toEqual([])
  })

  it('recordVisit adds an entry to the front', () => {
    useBrowserRecentStore.getState().recordVisit('https://a.com', 'A')
    useBrowserRecentStore.getState().recordVisit('https://b.com', 'B')
    const entries = useBrowserRecentStore.getState().entries
    expect(entries.map((e) => e.url)).toEqual(['https://b.com', 'https://a.com'])
  })

  it('revisiting a url dedups and moves it to the front with an updated title', () => {
    useBrowserRecentStore.getState().recordVisit('https://a.com', 'A')
    useBrowserRecentStore.getState().recordVisit('https://b.com', 'B')
    useBrowserRecentStore.getState().recordVisit('https://a.com', 'A (updated)')

    const entries = useBrowserRecentStore.getState().entries
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ url: 'https://a.com', title: 'A (updated)' })
  })

  it('caps at 30 entries', () => {
    for (let i = 0; i < 35; i++) {
      useBrowserRecentStore.getState().recordVisit(`https://site${i}.com`, `Site ${i}`)
    }
    const entries = useBrowserRecentStore.getState().entries
    expect(entries).toHaveLength(30)
    expect(entries[0].url).toBe('https://site34.com')
  })

  it('persists to localStorage', () => {
    useBrowserRecentStore.getState().recordVisit('https://a.com', 'A')
    const persisted = JSON.parse(localStorageStore['vide:browser:recent'])
    expect(persisted).toHaveLength(1)
    expect(persisted[0].url).toBe('https://a.com')
  })
})
