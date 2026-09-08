import { create } from 'zustand'

const STORAGE_KEY = 'vide:customTheme:overrides'

export const CUSTOM_COLOR_VARS = [
  { varName: '--color-accent',    label: 'Accent',      isAccent: true  },
  { varName: '--color-bg',        label: 'Background',  isAccent: false },
  { varName: '--color-panel',     label: 'Panel',       isAccent: false },
  { varName: '--color-sidebar',   label: 'Sidebar',     isAccent: false },
  { varName: '--color-tab-bar',   label: 'Tab Bar',     isAccent: false },
  { varName: '--color-border',    label: 'Border',      isAccent: false },
  { varName: '--color-fg',        label: 'Text',        isAccent: false },
  { varName: '--color-fg-muted',  label: 'Text Muted',  isAccent: false },
  { varName: '--color-fg-subtle', label: 'Text Subtle', isAccent: false },
] as const

// Accent is stored in CSS as "R G B" for Tailwind opacity modifiers — convert
// both ways when reading/writing the inline style override.
function hexToRgbSpace(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

function applyToDOM(varName: string, hex: string) {
  document.documentElement.style.setProperty(
    varName,
    varName === '--color-accent' ? hexToRgbSpace(hex) : hex,
  )
}

function removeFromDOM(varName: string) {
  document.documentElement.style.removeProperty(varName)
}

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

const initial = load()
Object.entries(initial).forEach(([k, v]) => applyToDOM(k, v))

interface CustomThemeStore {
  overrides: Record<string, string>   // varName → hex
  setOverride: (varName: string, hex: string) => void
  clearOverride: (varName: string) => void
  clearAll: () => void
}

export const useCustomThemeStore = create<CustomThemeStore>((set, get) => ({
  overrides: initial,

  setOverride: (varName, hex) => {
    const next = { ...get().overrides, [varName]: hex }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    applyToDOM(varName, hex)
    set({ overrides: next })
  },

  clearOverride: (varName) => {
    const next = { ...get().overrides }
    delete next[varName]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    removeFromDOM(varName)
    set({ overrides: next })
  },

  clearAll: () => {
    Object.keys(get().overrides).forEach(removeFromDOM)
    localStorage.removeItem(STORAGE_KEY)
    set({ overrides: {} })
  },
}))
