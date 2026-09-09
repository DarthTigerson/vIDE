import { create } from 'zustand'

const KEY = 'vide:browser:closedTabs'
const MAX_ENTRIES = 20

export interface BrowserClosedTab {
  url: string
  title: string
  closedAt: number
}

function getEntries(): BrowserClosedTab[] {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface BrowserClosedTabsStore {
  entries: BrowserClosedTab[]
  recordClosed: (url: string, title: string) => void
  removeEntry: (url: string) => void
  clear: () => void
}

export const useBrowserClosedTabsStore = create<BrowserClosedTabsStore>((set, get) => ({
  entries: getEntries(),

  recordClosed: (url, title) => {
    const withoutExisting = get().entries.filter((e) => e.url !== url)
    const next = [{ url, title, closedAt: Date.now() }, ...withoutExisting].slice(0, MAX_ENTRIES)
    localStorage.setItem(KEY, JSON.stringify(next))
    set({ entries: next })
  },

  removeEntry: (url) => {
    const next = get().entries.filter((e) => e.url !== url)
    localStorage.setItem(KEY, JSON.stringify(next))
    set({ entries: next })
  },

  clear: () => {
    localStorage.setItem(KEY, JSON.stringify([]))
    set({ entries: [] })
  },
}))
