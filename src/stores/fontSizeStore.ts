import { create } from 'zustand'
import { notifySettingChanged } from '../lib/notifySettingChanged'
import { onOtherWindowChange } from '../lib/crossWindowSettings'

const MIN = 5
const MAX = 24
const DEFAULT = 13
const STORAGE_KEY = 'vide:fontSize'

interface FontSizeStore {
  fontSize: number
  increase: () => void
  decrease: () => void
  reset: () => void
  setFontSize: (n: number) => void
}

function applyFontSize(size: number) {
  applyFontSizeToDOM(size)
  localStorage.setItem(STORAGE_KEY, String(size))
}

function readStoredFontSize(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEY) || DEFAULT)
  return stored >= MIN && stored <= MAX ? stored : DEFAULT
}

function applyFontSizeToDOM(size: number) {
  // Scale rem-based UI text (file tree, tabs, labels) proportionally.
  // Monaco and xterm are controlled separately via their own fontSize options.
  document.documentElement.style.fontSize = `${(size / DEFAULT) * 16}px`
}

const initial = readStoredFontSize()
applyFontSize(initial)

export const useFontSizeStore = create<FontSizeStore>((set, get) => ({
  fontSize: initial,
  increase: () => {
    const next = Math.min(get().fontSize + 1, MAX)
    applyFontSize(next)
    set({ fontSize: next })
    notifySettingChanged()
  },
  decrease: () => {
    const next = Math.max(get().fontSize - 1, MIN)
    applyFontSize(next)
    set({ fontSize: next })
    notifySettingChanged()
  },
  reset: () => {
    applyFontSize(DEFAULT)
    set({ fontSize: DEFAULT })
    notifySettingChanged()
  },
  // Used by remote-settings sync — does not trigger a push back to avoid loops.
  setFontSize: (n: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, n))
    applyFontSize(clamped)
    set({ fontSize: clamped })
  },
}))

// Font size changed in another vIDE window.
onOtherWindowChange([STORAGE_KEY], () => {
  const size = readStoredFontSize()
  applyFontSizeToDOM(size)
  useFontSizeStore.setState({ fontSize: size })
})
