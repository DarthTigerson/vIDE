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

import { useBrowserClosedTabsStore } from '../browserClosedTabsStore'

describe('browserClosedTabsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useBrowserClosedTabsStore.setState({ entries: [] })
  })

  it('starts empty', () => {
    expect(useBrowserClosedTabsStore.getState().entries).toEqual([])
  })

  it('recordClosed adds an entry to the front, deduping repeats', () => {
    useBrowserClosedTabsStore.getState().recordClosed('https://a.com', 'A')
    useBrowserClosedTabsStore.getState().recordClosed('https://b.com', 'B')
    useBrowserClosedTabsStore.getState().recordClosed('https://a.com', 'A')

    const entries = useBrowserClosedTabsStore.getState().entries
    expect(entries).toHaveLength(2)
    expect(entries[0].url).toBe('https://a.com')
  })

  it('removeEntry deletes just that entry', () => {
    useBrowserClosedTabsStore.getState().recordClosed('https://a.com', 'A')
    useBrowserClosedTabsStore.getState().recordClosed('https://b.com', 'B')
    useBrowserClosedTabsStore.getState().removeEntry('https://a.com')

    const entries = useBrowserClosedTabsStore.getState().entries
    expect(entries.map((e) => e.url)).toEqual(['https://b.com'])
  })

  it('caps at 20 entries', () => {
    for (let i = 0; i < 25; i++) {
      useBrowserClosedTabsStore.getState().recordClosed(`https://site${i}.com`, `Site ${i}`)
    }
    expect(useBrowserClosedTabsStore.getState().entries).toHaveLength(20)
  })

  it('persists to localStorage', () => {
    useBrowserClosedTabsStore.getState().recordClosed('https://a.com', 'A')
    const persisted = JSON.parse(localStorageStore['vide:browser:closedTabs'])
    expect(persisted).toHaveLength(1)
  })

  it('clear empties entries and persists the empty state', () => {
    useBrowserClosedTabsStore.getState().recordClosed('https://a.com', 'A')
    useBrowserClosedTabsStore.getState().recordClosed('https://b.com', 'B')

    useBrowserClosedTabsStore.getState().clear()

    expect(useBrowserClosedTabsStore.getState().entries).toEqual([])
    expect(JSON.parse(localStorageStore['vide:browser:closedTabs'])).toEqual([])
  })
})
