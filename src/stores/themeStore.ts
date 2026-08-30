import { create } from 'zustand'
import type { ITheme } from '@xterm/xterm'
import { hexWithAlpha } from '@/lib/color'

export type ThemeId =
  | 'claude-dark' | 'claude-light'
  | 'thomas-dark' | 'thomas-light'
  | 'luuk-dark'   | 'luuk-light'
  | 'link-dark'   | 'link-light'
  | 'atreus-dark' | 'atreus-light'

interface ThemeStore {
  theme: ThemeId
  matchSystem: boolean
  setTheme: (theme: ThemeId) => void
  setMatchSystem: (matchSystem: boolean) => void
  setFamily: (family: string) => void
  setVariant: (dark: boolean) => void
}

const STORAGE_KEY = 'vide:theme'
const MATCH_SYSTEM_STORAGE_KEY = 'vide:themeMatchSystem'

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)
}

export function familyOf(theme: ThemeId): string {
  return theme.replace(/-(dark|light)$/, '')
}

function variantFor(family: string, dark: boolean): ThemeId {
  return `${family}-${dark ? 'dark' : 'light'}` as ThemeId
}

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const initialMatchSystem = localStorage.getItem(MATCH_SYSTEM_STORAGE_KEY) === 'true'
const storedTheme = (localStorage.getItem(STORAGE_KEY) as ThemeId | null) ?? 'claude-dark'
const initialTheme = initialMatchSystem
  ? variantFor(familyOf(storedTheme), systemDarkQuery.matches)
  : storedTheme
applyTheme(initialTheme)

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: initialTheme,
  matchSystem: initialMatchSystem,
  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem(MATCH_SYSTEM_STORAGE_KEY, 'false')
    set({ theme, matchSystem: false })
  },
  setMatchSystem: (matchSystem) => {
    localStorage.setItem(MATCH_SYSTEM_STORAGE_KEY, String(matchSystem))
    if (matchSystem) {
      const next = variantFor(familyOf(get().theme), systemDarkQuery.matches)
      applyTheme(next)
      set({ matchSystem, theme: next })
    } else {
      set({ matchSystem })
    }
  },
  // Switches only the color family (Claude/Thomas/Luuk/Link), preserving
  // whether the current variant is light or dark — including "follow
  // system," which setTheme() would otherwise always turn off.
  setFamily: (family) => {
    const { theme, matchSystem } = get()
    const dark = matchSystem ? systemDarkQuery.matches : theme.endsWith('-dark')
    const next = variantFor(family, dark)
    applyTheme(next)
    set({ theme: next })
  },
  // Explicit light/dark pick, preserving the current family. Like setTheme,
  // an explicit choice here always turns off "follow system."
  setVariant: (dark) => {
    const next = variantFor(familyOf(get().theme), dark)
    applyTheme(next)
    localStorage.setItem(MATCH_SYSTEM_STORAGE_KEY, 'false')
    set({ theme: next, matchSystem: false })
  },
}))

systemDarkQuery.addEventListener('change', (e) => {
  const { matchSystem, theme } = useThemeStore.getState()
  if (!matchSystem) return
  const next = variantFor(familyOf(theme), e.matches)
  applyTheme(next)
  useThemeStore.setState({ theme: next })
})

// Custom themes registered by defineMonacoThemes() (src/monacoThemes.ts) — the
// built-in 'vs-dark'/'vs' themes only coincidentally matched Claude/Codex's
// colors and didn't track Thomas's warm palette at all.
export const MONACO_THEMES: Record<ThemeId, string> = {
  'claude-dark':  'claude-dark',
  'claude-light': 'claude-light',
  'thomas-dark':  'thomas-dark',
  'thomas-light': 'thomas-light',
  'luuk-dark':    'luuk-dark',
  'luuk-light':   'luuk-light',
  'link-dark':    'link-dark',
  'link-light':   'link-light',
  'atreus-dark':  'atreus-dark',
  'atreus-light': 'atreus-light',
}

// background/foreground/cursor alone aren't enough for a terminal to feel
// themed — ls, git status, and most shell prompts color their output with
// the ANSI 16-color palette, so that needs tuning per-theme too or the
// terminal looks unchanged no matter what theme is active.
export const XTERM_THEMES: Record<ThemeId, ITheme> = {
  'claude-dark': {
    background:          '#1a1a1a',
    foreground:          '#cccccc',
    cursor:              '#d97757',
    selectionBackground: '#d9775740',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#cccccc',
    brightBlack:         '#5c6370',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  'claude-light': {
    background:          '#f3f3f3',
    foreground:          '#1e1e1e',
    cursor:              '#c4613d',
    selectionBackground: '#c4613d40',
    black:               '#383a42',
    red:                 '#e45649',
    green:               '#50a14f',
    yellow:              '#c18401',
    blue:                '#4078f2',
    magenta:             '#a626a4',
    cyan:                '#0184bc',
    white:               '#a0a1a7',
    brightBlack:         '#696c77',
    brightRed:           '#e06c75',
    brightGreen:         '#98c379',
    brightYellow:        '#e5c07b',
    brightBlue:          '#61afef',
    brightMagenta:       '#c678dd',
    brightCyan:          '#56b6c2',
    brightWhite:         '#1e1e1e',
  },
  'thomas-dark': {
    background:          '#1c1712',
    foreground:          '#e8e0d0',
    cursor:              '#f5c242',
    selectionBackground: '#f5c24240',
    black:               '#332a1e',
    red:                 '#e0685a',
    green:               '#a8b562',
    yellow:              '#f5c242',
    blue:                '#6fa8c2',
    magenta:             '#c98fc2',
    cyan:                '#7fbfae',
    white:               '#e8e0d0',
    brightBlack:         '#665c4a',
    brightRed:           '#f0897d',
    brightGreen:         '#c3d089',
    brightYellow:        '#ffd873',
    brightBlue:          '#90c4dd',
    brightMagenta:       '#e0aee0',
    brightCyan:          '#a0d9c8',
    brightWhite:         '#fff8ea',
  },
  'thomas-light': {
    background:          '#f7f1e0',
    foreground:          '#2a2013',
    cursor:              '#ad7b00',
    selectionBackground: '#ad7b0040',
    black:               '#4a4030',
    red:                 '#b5433a',
    green:               '#6b7d2e',
    yellow:              '#ad7b00',
    blue:                '#33658a',
    magenta:             '#8a4a8a',
    cyan:                '#2f7d72',
    white:               '#2a2013',
    brightBlack:         '#74684f',
    brightRed:           '#d1584c',
    brightGreen:         '#8a9d44',
    brightYellow:        '#d1a012',
    brightBlue:          '#4a7fa8',
    brightMagenta:       '#a866a8',
    brightCyan:          '#3f9d8f',
    brightWhite:         '#1a140c',
  },
  // Luuk hates light mode, so "Luuk Light" is a gag — identical to "Luuk
  // Dark" down to every value. A true-black/graphite palette, distinct from
  // the other themes' warmer or off-black backgrounds.
  'luuk-dark': {
    background:          '#0d0d0d',
    foreground:          '#d4d4d4',
    cursor:              '#9e9e9e',
    selectionBackground: '#9e9e9e30',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#d4d4d4',
    brightBlack:         '#5c6370',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  'luuk-light': {
    background:          '#0d0d0d',
    foreground:          '#d4d4d4',
    cursor:              '#9e9e9e',
    selectionBackground: '#9e9e9e30',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#d4d4d4',
    brightBlack:         '#5c6370',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  'link-dark': {
    background:          '#12160f',
    foreground:          '#eef0d5',
    cursor:              '#9ac26a',
    selectionBackground: '#9ac26a40',
    black:               '#232b1c',
    red:                 '#d97a6a',
    green:               '#9ac26a',
    yellow:              '#e3a237',
    blue:                '#4fa3b0',
    magenta:             '#c98fc2',
    cyan:                '#6fc2b8',
    white:               '#eef0d5',
    brightBlack:         '#5f6650',
    brightRed:           '#f0948a',
    brightGreen:         '#b8dc94',
    brightYellow:        '#f0c26a',
    brightBlue:          '#7fc2cf',
    brightMagenta:       '#e0aee0',
    brightCyan:          '#94ded4',
    brightWhite:         '#fdfee8',
  },
  'link-light': {
    background:          '#fdfee8',
    foreground:          '#3a2f1e',
    cursor:              '#6b8a3d',
    selectionBackground: '#6b8a3d40',
    black:               '#453c28',
    red:                 '#a8503f',
    green:               '#6b8a3d',
    yellow:              '#b98a1f',
    blue:                '#2f7d8a',
    magenta:             '#8a4a8a',
    cyan:                '#2f7d72',
    white:               '#3a2f1e',
    brightBlack:         '#74684a',
    brightRed:           '#d1685a',
    brightGreen:         '#8fae5c',
    brightYellow:        '#d1a034',
    brightBlue:          '#4a9aa8',
    brightMagenta:       '#a866a8',
    brightCyan:          '#3f9d8f',
    brightWhite:         '#1a1608',
  },
  'atreus-dark': {
    background:          '#12151f',
    foreground:          '#e4e7f2',
    cursor:              '#5468c4',
    selectionBackground: '#5468c440',
    black:               '#232a3d',
    red:                 '#d97a7a',
    green:               '#7ac9a0',
    yellow:              '#d4b46a',
    blue:                '#5468c4',
    magenta:             '#b98fc9',
    cyan:                '#6fc2d9',
    white:               '#e4e7f2',
    brightBlack:         '#4f5670',
    brightRed:           '#f0948a',
    brightGreen:         '#94dcb8',
    brightYellow:        '#f0cf94',
    brightBlue:          '#7f94e0',
    brightMagenta:       '#d4aee0',
    brightCyan:          '#94dcea',
    brightWhite:         '#fdfeff',
  },
  'atreus-light': {
    background:          '#eef0f5',
    foreground:          '#1c2233',
    cursor:              '#2c3a6e',
    selectionBackground: '#2c3a6e40',
    black:               '#3a4055',
    red:                 '#a8433f',
    green:               '#3f7a5c',
    yellow:              '#92721f',
    blue:                '#2c3a6e',
    magenta:             '#7a4a8a',
    cyan:                '#257d8a',
    white:               '#1c2233',
    brightBlack:         '#5c6480',
    brightRed:           '#d1685a',
    brightGreen:         '#5c9d7c',
    brightYellow:        '#b9963f',
    brightBlue:          '#4a5da8',
    brightMagenta:       '#a866a8',
    brightCyan:          '#3f9dad',
    brightWhite:         '#0d0f18',
  },
}

// "glass" panel style needs the terminal surface itself to be see-through,
// not just its wrapper div — xterm paints its own opaque background from
// ITheme.background, independent of the --color-bg CSS custom property the
// rest of the UI uses. Matches --color-bg's glass alpha in index.css so the
// terminal blends with the same transparency as its own wrapper panel.
const XTERM_GLASS_ALPHA = 0.2

export function glassXtermTheme(theme: ThemeId): ITheme {
  const base = XTERM_THEMES[theme]
  return { ...base, background: hexWithAlpha(base.background!, XTERM_GLASS_ALPHA) }
}

// Swatch metadata for theme pickers (DisplayPage, the setup wizard) — kept
// here alongside XTERM_THEMES/MONACO_THEMES so the three stay in sync rather
// than duplicating a hand-picked swatch list per picker.
export interface ThemeOption {
  id: ThemeId
  name: string
  swatches: string[]
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'claude-dark',  name: 'Claude Dark',  swatches: ['#1a1a1a', '#252526', '#1e1e1e', '#d97757', '#3c3c3c'] },
  { id: 'claude-light', name: 'Claude Light', swatches: ['#f3f3f3', '#ececec', '#ffffff', '#c4613d', '#e0e0e0'] },
  { id: 'thomas-dark',  name: 'Thomas Dark',  swatches: ['#1c1712', '#2b2319', '#221c15', '#f5c242', '#4a3d29'] },
  { id: 'thomas-light', name: 'Thomas Light', swatches: ['#f7f1e0', '#efe6cd', '#fffcf2', '#ad7b00', '#d8c89a'] },
  // Luuk hates light mode — "Luuk Light" is a gag, identical to "Luuk Dark".
  { id: 'luuk-dark',    name: 'Luuk Dark',    swatches: ['#0d0d0d', '#111111', '#141414', '#9e9e9e', '#2e2e2e'] },
  { id: 'luuk-light',   name: 'Luuk Light',   swatches: ['#0d0d0d', '#111111', '#141414', '#9e9e9e', '#2e2e2e'] },
  { id: 'link-dark',    name: 'Link Dark',    swatches: ['#12160f', '#1c2216', '#171c13', '#9ac26a', '#3a4a2c'] },
  { id: 'link-light',   name: 'Link Light',   swatches: ['#fdfee8', '#eef0cf', '#fffef2', '#6b8a3d', '#c9c093'] },
  { id: 'atreus-dark',  name: 'Atreus Dark',  swatches: ['#12151f', '#1c2233', '#171b28', '#5468c4', '#3a4460'] },
  { id: 'atreus-light', name: 'Atreus Light', swatches: ['#eef0f5', '#e2e5ee', '#f8f9fc', '#2c3a6e', '#c2c8dc'] },
]
