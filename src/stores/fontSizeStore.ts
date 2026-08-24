import { create } from 'zustand'

const MIN = 5
const MAX = 24
const DEFAULT = 13
const STORAGE_KEY = 'vide:fontSize'

interface FontSizeStore {
  fontSize: number
  increase: () => void
  decrease: () => void
  reset: () => void
}

function applyFontSize(size: number) {
  // Scale rem-based UI text (file tree, tabs, labels) proportionally.
  // Monaco and xterm are controlled separately via their own fontSize options.
  document.documentElement.style.fontSize = `${(size / DEFAULT) * 16}px`
  localStorage.setItem(STORAGE_KEY, String(size))
}

const stored = Number(localStorage.getItem(STORAGE_KEY) || DEFAULT)
const initial = stored >= MIN && stored <= MAX ? stored : DEFAULT
applyFontSize(initial)

export const useFontSizeStore = create<FontSizeStore>((set, get) => ({
  fontSize: initial,
  increase: () => {
    const next = Math.min(get().fontSize + 1, MAX)
    applyFontSize(next)
    set({ fontSize: next })
  },
  decrease: () => {
    const next = Math.max(get().fontSize - 1, MIN)
    applyFontSize(next)
    set({ fontSize: next })
  },
  reset: () => {
    applyFontSize(DEFAULT)
    set({ fontSize: DEFAULT })
  },
}))
