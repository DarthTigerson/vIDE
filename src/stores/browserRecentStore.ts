import { create } from 'zustand'

const KEY = 'vide:browser:recent'
const MAX_ENTRIES = 30

export interface BrowserRecentEntry {
  url: string
  title: string
  visitedAt: number
}

function getEntries(): BrowserRecentEntry[] {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface BrowserRecentStore {
  entries: BrowserRecentEntry[]
  recordVisit: (url: string, title: string) => void
  clear: () => void
}

export const useBrowserRecentStore = create<BrowserRecentStore>((set, get) => ({
  entries: getEntries(),

  recordVisit: (url, title) => {
    const withoutExisting = get().entries.filter((e) => e.url !== url)
    const next = [{ url, title, visitedAt: Date.now() }, ...withoutExisting].slice(0, MAX_ENTRIES)
    localStorage.setItem(KEY, JSON.stringify(next))
    set({ entries: next })
  },

  clear: () => {
    localStorage.setItem(KEY, JSON.stringify([]))
    set({ entries: [] })
  },
}))
