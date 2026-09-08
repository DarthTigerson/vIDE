import { create } from 'zustand'
import type { ITheme } from '@xterm/xterm'
import { useThemeStore, familyOf, THEME_OPTIONS, XTERM_THEMES, glassXtermTheme, XTERM_GLASS_ALPHA, type ThemeId } from './themeStore'
import { hexWithAlpha } from '@/lib/color'

const STORAGE_KEY = 'vide:customThemes'

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

export type CustomColorVar = typeof CUSTOM_COLOR_VARS[number]['varName']
type Palette = Record<CustomColorVar, string>

export interface CustomTheme {
  id: string
  name: string
  baseFamily: string
  light: Palette
  dark: Palette
}

// Accent is stored in CSS as "R G B" for Tailwind opacity modifiers — convert
// both ways when reading/writing.
function hexToRgbSpace(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

function rgbSpaceToHex(raw: string): string {
  const parts = raw.split(/\s+/).map(Number)
  return parts.length === 3 && parts.every((n) => !isNaN(n))
    ? '#' + parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
    : '#808080'
}

function applyToDOM(varName: CustomColorVar, hex: string) {
  document.documentElement.style.setProperty(
    varName,
    varName === '--color-accent' ? hexToRgbSpace(hex) : hex,
  )
}

function removeFromDOM(varName: CustomColorVar) {
  document.documentElement.style.removeProperty(varName)
}

function applyPalette(palette: Palette) {
  CUSTOM_COLOR_VARS.forEach((def) => applyToDOM(def.varName, palette[def.varName]))
}

function removePalette() {
  CUSTOM_COLOR_VARS.forEach((def) => removeFromDOM(def.varName))
}

function currentVariant(): 'light' | 'dark' {
  return useThemeStore.getState().theme.endsWith('-dark') ? 'dark' : 'light'
}

// Reads the 9 CUSTOM_COLOR_VARS as computed under `themeId`'s built-in CSS,
// independent of whatever custom theme (if any) currently has inline
// overrides applied. Temporarily removes any inline overrides and swaps
// data-theme, reads, then restores both — synchronously, so there's no
// visible flash and no risk of reading an active override back instead of
// the true built-in default.
function readBuiltInPalette(themeId: string): Palette {
  const el = document.documentElement
  const originalAttr = el.getAttribute('data-theme')
  const savedInline: Partial<Record<CustomColorVar, string>> = {}
  CUSTOM_COLOR_VARS.forEach((def) => {
    const v = el.style.getPropertyValue(def.varName)
    if (v) savedInline[def.varName] = v
    el.style.removeProperty(def.varName)
  })

  el.setAttribute('data-theme', themeId)
  const styles = getComputedStyle(el)
  const palette = {} as Palette
  CUSTOM_COLOR_VARS.forEach((def) => {
    const raw = styles.getPropertyValue(def.varName).trim()
    palette[def.varName] = def.isAccent
      ? rgbSpaceToHex(raw)
      : (raw.startsWith('#') ? raw : '#000000')
  })

  if (originalAttr === null) el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', originalAttr)
  Object.entries(savedInline).forEach(([k, v]) => el.style.setProperty(k, v as string))

  return palette
}

function isValidPalette(value: unknown): value is Palette {
  if (typeof value !== 'object' || value === null) return false
  const palette = value as Record<string, unknown>
  return CUSTOM_COLOR_VARS.every((def) => typeof palette[def.varName] === 'string')
}

function isValidCustomTheme(value: unknown): value is CustomTheme {
  if (typeof value !== 'object' || value === null) return false
  const theme = value as Record<string, unknown>
  return (
    typeof theme.id === 'string' &&
    typeof theme.name === 'string' &&
    typeof theme.baseFamily === 'string' &&
    isValidPalette(theme.light) &&
    isValidPalette(theme.dark)
  )
}

function load(): { themes: CustomTheme[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { themes: [], activeId: null }
    const parsed = JSON.parse(raw)
    return {
      themes: Array.isArray(parsed?.themes) ? parsed.themes.filter(isValidCustomTheme) : [],
      activeId: typeof parsed?.activeId === 'string' ? parsed.activeId : null,
    }
  } catch {
    return { themes: [], activeId: null }
  }
}

function persist(themes: CustomTheme[], activeId: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ themes, activeId }))
}

const initial = load()
if (initial.activeId) {
  const active = initial.themes.find((t) => t.id === initial.activeId)
  if (active) applyPalette(active[currentVariant()])
}

interface CustomThemeStore {
  themes: CustomTheme[]
  activeId: string | null
  createFromActive: (name: string) => string
  rename: (id: string, name: string) => void
  setSwatch: (id: string, variant: 'light' | 'dark', varName: CustomColorVar, hex: string) => void
  copyVariant: (id: string, from: 'light' | 'dark', to: 'light' | 'dark') => void
  deleteTheme: (id: string) => void
  setActive: (id: string | null) => void
  exportTheme: (id: string) => string
  importTheme: (json: string) => { ok: true; id: string } | { ok: false; error: string }
}

const IMPORT_ERROR = "Couldn't read that theme — check the pasted text and try again."

export const useCustomThemeStore = create<CustomThemeStore>((set, get) => ({
  themes: initial.themes,
  activeId: initial.activeId,

  createFromActive: (name) => {
    const { themes, activeId } = get()
    const active = activeId ? themes.find((t) => t.id === activeId) : undefined
    const baseFamily = familyOf(useThemeStore.getState().theme)
    const light = active ? active.light : readBuiltInPalette(`${baseFamily}-light`)
    const dark = active ? active.dark : readBuiltInPalette(`${baseFamily}-dark`)
    const id = crypto.randomUUID()
    const newTheme: CustomTheme = { id, name, baseFamily, light, dark }
    const next = [...themes, newTheme]
    set({ themes: next, activeId: id })
    persist(next, id)
    applyPalette(newTheme[currentVariant()])
    return id
  },

  rename: (id, name) => {
    const next = get().themes.map((t) => (t.id === id ? { ...t, name } : t))
    set({ themes: next })
    persist(next, get().activeId)
  },

  setSwatch: (id, variant, varName, hex) => {
    const next = get().themes.map((t) =>
      t.id === id ? { ...t, [variant]: { ...t[variant], [varName]: hex } } : t,
    )
    set({ themes: next })
    persist(next, get().activeId)
    if (get().activeId === id && variant === currentVariant()) applyToDOM(varName, hex)
  },

  copyVariant: (id, from, to) => {
    const target = get().themes.find((t) => t.id === id)
    if (!target) return
    const copied: Palette = { ...target[from] }
    const next = get().themes.map((t) => (t.id === id ? { ...t, [to]: copied } : t))
    set({ themes: next })
    persist(next, get().activeId)
    if (get().activeId === id && to === currentVariant()) applyPalette(copied)
  },

  deleteTheme: (id) => {
    const wasActive = get().activeId === id
    const next = get().themes.filter((t) => t.id !== id)
    const activeId = wasActive ? null : get().activeId
    if (wasActive) removePalette()
    set({ themes: next, activeId })
    persist(next, activeId)
  },

  setActive: (id) => {
    if (get().activeId === id) return
    if (id === null) {
      removePalette()
      set({ activeId: null })
      persist(get().themes, null)
      return
    }
    const theme = get().themes.find((t) => t.id === id)
    if (!theme) return
    applyPalette(theme[currentVariant()])
    set({ activeId: id })
    persist(get().themes, id)
  },

  exportTheme: (id) => {
    const theme = get().themes.find((t) => t.id === id)
    if (!theme) return ''
    const { name, baseFamily, light, dark } = theme
    return JSON.stringify({ name, baseFamily, light, dark })
  },

  importTheme: (json) => {
    let parsed: any
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, error: IMPORT_ERROR }
    }
    if (
      !parsed || typeof parsed.name !== 'string' ||
      typeof parsed.light !== 'object' || parsed.light === null ||
      typeof parsed.dark !== 'object' || parsed.dark === null
    ) {
      return { ok: false, error: IMPORT_ERROR }
    }

    const baseFamily = typeof parsed.baseFamily === 'string' &&
      THEME_OPTIONS.some((t) => familyOf(t.id) === parsed.baseFamily)
      ? parsed.baseFamily
      : 'claude'
    const fallbackLight = readBuiltInPalette(`${baseFamily}-light`)
    const fallbackDark = readBuiltInPalette(`${baseFamily}-dark`)

    const light = {} as Palette
    const dark = {} as Palette
    CUSTOM_COLOR_VARS.forEach((def) => {
      light[def.varName] = typeof parsed.light[def.varName] === 'string' ? parsed.light[def.varName] : fallbackLight[def.varName]
      dark[def.varName] = typeof parsed.dark[def.varName] === 'string' ? parsed.dark[def.varName] : fallbackDark[def.varName]
    })

    const id = crypto.randomUUID()
    const theme: CustomTheme = { id, name: parsed.name, baseFamily, light, dark }
    const next = [...get().themes, theme]
    set({ themes: next })
    persist(next, get().activeId)
    return { ok: true, id }
  },
}))

useThemeStore.subscribe((state, prevState) => {
  if (state.theme === prevState.theme) return
  const { activeId, themes } = useCustomThemeStore.getState()
  if (!activeId) return
  const theme = themes.find((t) => t.id === activeId)
  if (theme) applyPalette(theme[currentVariant()])
})

// Monaco/xterm keep rendering the built-in `themeId`'s own palette (see the
// spec's "Base family" section) — a custom theme only ever overrides the 9
// CUSTOM_COLOR_VARS chrome variables, never Monaco tokens or the xterm ANSI
// palette. Its background is the one exception: leaving the terminal on a
// stock dark/light background while every other panel follows the custom
// theme reads as a bug, not a design choice, so this substitutes just that.
export function effectiveXtermTheme(themeId: ThemeId, glass: boolean): ITheme {
  const base = glass ? glassXtermTheme(themeId) : XTERM_THEMES[themeId]
  const { activeId, themes } = useCustomThemeStore.getState()
  const active = activeId ? themes.find((t) => t.id === activeId) : undefined
  if (!active) return base
  const bg = active[currentVariant()]['--color-bg']
  return { ...base, background: glass ? hexWithAlpha(bg, XTERM_GLASS_ALPHA) : bg }
}
