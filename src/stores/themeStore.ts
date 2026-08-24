import { create } from 'zustand'
import type { ITheme } from '@xterm/xterm'
import { hexWithAlpha } from '@/lib/color'

export type ThemeId =
  | 'claude-dark' | 'claude-light'
  | 'codex-dark'  | 'codex-light'
  | 'thomas-dark' | 'thomas-light'
  | 'luuk-dark'   | 'luuk-light'

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
  // Switches only the color family (Claude/Codex/Thomas/Luuk), preserving
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
  'codex-dark':   'codex-dark',
  'codex-light':  'codex-light',
  'thomas-dark':  'thomas-dark',
  'thomas-light': 'thomas-light',
  'luuk-dark':    'luuk-dark',
  'luuk-light':   'luuk-light',
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
  'codex-dark': {
    background:          '#1a1a1a',
    foreground:          '#cccccc',
    cursor:              '#ffffff',
    selectionBackground: '#ffffff30',
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
  'codex-light': {
    background:          '#fafafa',
    foreground:          '#24292f',
    cursor:              '#0969da',
    selectionBackground: '#0969da40',
    black:               '#24292f',
    red:                 '#cf222e',
    green:               '#116329',
    yellow:              '#9a6700',
    blue:                '#0969da',
    magenta:             '#8250df',
    cyan:                '#1b7c83',
    white:               '#6e7781',
    brightBlack:         '#57606a',
    brightRed:           '#a40e26',
    brightGreen:         '#1a7f37',
    brightYellow:        '#633c01',
    brightBlue:          '#218bff',
    brightMagenta:       '#a475f9',
    brightCyan:          '#3192aa',
    brightWhite:         '#8c959f',
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
  { id: 'codex-dark',   name: 'Codex Dark',   swatches: ['#1a1a1a', '#1a1a1a', '#202020', '#ffffff', '#333333'] },
  { id: 'codex-light',  name: 'Codex Light',  swatches: ['#fafafa', '#fafafa', '#ffffff', '#0969da', '#d0d7de'] },
  { id: 'thomas-dark',  name: 'Thomas Dark',  swatches: ['#1c1712', '#2b2319', '#221c15', '#f5c242', '#4a3d29'] },
  { id: 'thomas-light', name: 'Thomas Light', swatches: ['#f7f1e0', '#efe6cd', '#fffcf2', '#ad7b00', '#d8c89a'] },
  // Luuk hates light mode — "Luuk Light" is a gag, identical to "Luuk Dark".
  { id: 'luuk-dark',    name: 'Luuk Dark',    swatches: ['#0d0d0d', '#111111', '#141414', '#9e9e9e', '#2e2e2e'] },
  { id: 'luuk-light',   name: 'Luuk Light',   swatches: ['#0d0d0d', '#111111', '#141414', '#9e9e9e', '#2e2e2e'] },
]
