import { create } from 'zustand'
import type { ITheme } from '@xterm/xterm'
import { hexWithAlpha } from '@/lib/color'
import { notifySettingChanged } from '../lib/notifySettingChanged'

export type ThemeId =
  | 'claude-dark'   | 'claude-light'
  | 'thomas-dark'   | 'thomas-light'
  | 'luuk-dark'     | 'luuk-light'
  | 'borahae-dark'  | 'borahae-light'
  | 'link-dark'     | 'link-light'
  | 'atreus-dark'   | 'atreus-light'
  | 'gabriele-dark' | 'gabriele-light'

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
    notifySettingChanged()
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
    notifySettingChanged()
  },
  // Switches only the color family (Claude/vIDE/Luuk/Link), preserving
  // whether the current variant is light or dark — including "follow
  // system," which setTheme() would otherwise always turn off.
  setFamily: (family) => {
    const { theme, matchSystem } = get()
    const dark = matchSystem ? systemDarkQuery.matches : theme.endsWith('-dark')
    const next = variantFor(family, dark)
    applyTheme(next)
    set({ theme: next })
    notifySettingChanged()
  },
  // Explicit light/dark pick, preserving the current family. Like setTheme,
  // an explicit choice here always turns off "follow system."
  setVariant: (dark) => {
    const next = variantFor(familyOf(get().theme), dark)
    applyTheme(next)
    localStorage.setItem(MATCH_SYSTEM_STORAGE_KEY, 'false')
    set({ theme: next, matchSystem: false })
    notifySettingChanged()
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
// built-in 'vs-dark'/'vs' themes only coincidentally matched Claude's colors
// and didn't track vIDE's own palettes at all.
export const MONACO_THEMES: Record<ThemeId, string> = {
  'claude-dark':  'claude-dark',
  'claude-light': 'claude-light',
  'thomas-dark':  'thomas-dark',
  'thomas-light': 'thomas-light',
  'luuk-dark':    'luuk-dark',
  'luuk-light':   'luuk-light',
  'borahae-dark':  'borahae-dark',
  'borahae-light': 'borahae-light',
  'link-dark':    'link-dark',
  'link-light':   'link-light',
  'atreus-dark':  'atreus-dark',
  'atreus-light': 'atreus-light',
  'gabriele-dark':  'gabriele-dark',
  'gabriele-light': 'gabriele-light',
}

// background/foreground/cursor alone aren't enough for a terminal to feel
// themed — ls, git status, and most shell prompts color their output with
// the ANSI 16-color palette, so that needs tuning per-theme too or the
// terminal looks unchanged no matter what theme is active.
export const XTERM_THEMES: Record<ThemeId, ITheme> = {
  'claude-dark': {
    background:          '#111111',
    foreground:          '#d9d9d9',
    cursor:              '#db7d5e',
    selectionBackground: '#db7d5e40',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#d9d9d9',
    brightBlack:         '#878787',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  'claude-light': {
    background:          '#f1f1f1',
    foreground:          '#222222',
    cursor:              '#9a4c2f',
    selectionBackground: '#9a4c2f40',
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
    background:          '#0f1115',
    foreground:          '#e6e9ef',
    cursor:              '#ffb020',
    selectionBackground: '#ffb02040',
    black:               '#1c212a',
    red:                 '#e0685a',
    green:               '#a8b562',
    yellow:              '#f5c242',
    blue:                '#6fa8c2',
    magenta:             '#c98fc2',
    cyan:                '#7fbfae',
    white:               '#e6e9ef',
    brightBlack:         '#838c9c',
    brightRed:           '#f0897d',
    brightGreen:         '#c3d089',
    brightYellow:        '#ffd873',
    brightBlue:          '#90c4dd',
    brightMagenta:       '#e0aee0',
    brightCyan:          '#a0d9c8',
    brightWhite:         '#ffffff',
  },
  'thomas-light': {
    background:          '#eceef2',
    foreground:          '#14171c',
    cursor:              '#9a5b00',
    selectionBackground: '#9a5b0040',
    black:               '#2b3039',
    red:                 '#b5433a',
    green:               '#6b7d2e',
    yellow:              '#ad7b00',
    blue:                '#33658a',
    magenta:             '#8a4a8a',
    cyan:                '#2f7d72',
    white:               '#14171c',
    brightBlack:         '#464e5b',
    brightRed:           '#d1584c',
    brightGreen:         '#8a9d44',
    brightYellow:        '#d1a012',
    brightBlue:          '#4a7fa8',
    brightMagenta:       '#a866a8',
    brightCyan:          '#3f9d8f',
    brightWhite:         '#0b0d10',
  },
  // Luuk hates light mode, so "Luuk Light" is a gag — identical to "Luuk
  // Dark" down to every value. A true-black/graphite palette, distinct from
  // the other themes' tinted backgrounds.
  'luuk-dark': {
    background:          '#0b0b0b',
    foreground:          '#cfcfcf',
    cursor:              '#9e9e9e',
    selectionBackground: '#9e9e9e30',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#cfcfcf',
    brightBlack:         '#808080',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  'luuk-light': {
    background:          '#0b0b0b',
    foreground:          '#cfcfcf',
    cursor:              '#9e9e9e',
    selectionBackground: '#9e9e9e30',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#cfcfcf',
    brightBlack:         '#808080',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  // "Borahae" (보라해) — BTS/ARMY's "I purple you", coined by V (Kim
  // Taehyung) in 2016. Purple is the last colour of the rainbow, meaning
  // "I'll trust and love you for a long time."
  'borahae-dark': {
    background:          '#100e15',
    foreground:          '#d4d3d9',
    cursor:              '#a17cf8',
    selectionBackground: '#a17cf840',
    black:               '#1d1927',
    red:                 '#e0687a',
    green:               '#8fd19e',
    yellow:              '#e5c07b',
    blue:                '#7aa2f7',
    magenta:             '#c58af9',
    cyan:                '#7fd4c9',
    white:               '#d4d3d9',
    brightBlack:         '#877f9a',
    brightRed:           '#f08a99',
    brightGreen:         '#a8e0b8',
    brightYellow:        '#f0d090',
    brightBlue:          '#9ab8ff',
    brightMagenta:       '#dcaefc',
    brightCyan:          '#9ee8dc',
    brightWhite:         '#fffaff',
  },
  'borahae-light': {
    background:          '#efe9f9',
    foreground:          '#1e1926',
    cursor:              '#6d28d9',
    selectionBackground: '#6d28d940',
    black:               '#3a2f52',
    red:                 '#b5433f',
    green:               '#4f8a5c',
    yellow:              '#92721f',
    blue:                '#3355a8',
    magenta:             '#8a3fae',
    cyan:                '#2f8a7d',
    white:               '#1e1926',
    brightBlack:         '#4e4161',
    brightRed:           '#d1685a',
    brightGreen:         '#6ba578',
    brightYellow:        '#b9963f',
    brightBlue:          '#5a78c4',
    brightMagenta:       '#a866d1',
    brightCyan:          '#4aa89a',
    brightWhite:         '#100b1a',
  },
  'link-dark': {
    background:          '#11150e',
    foreground:          '#dcdfda',
    cursor:              '#9ac26a',
    selectionBackground: '#9ac26a40',
    black:               '#232b1c',
    red:                 '#d97a6a',
    green:               '#9ac26a',
    yellow:              '#e3a237',
    blue:                '#4fa3b0',
    magenta:             '#c98fc2',
    cyan:                '#6fc2b8',
    white:               '#dcdfda',
    brightBlack:         '#7e9071',
    brightRed:           '#f0948a',
    brightGreen:         '#b8dc94',
    brightYellow:        '#f0c26a',
    brightBlue:          '#7fc2cf',
    brightMagenta:       '#e0aee0',
    brightCyan:          '#94ded4',
    brightWhite:         '#fdfee8',
  },
  'link-light': {
    background:          '#fbfbe6',
    foreground:          '#2c2d1a',
    cursor:              '#597232',
    selectionBackground: '#59723240',
    black:               '#453c28',
    red:                 '#a8503f',
    green:               '#6b8a3d',
    yellow:              '#b98a1f',
    blue:                '#2f7d8a',
    magenta:             '#8a4a8a',
    cyan:                '#2f7d72',
    white:               '#2c2d1a',
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
    background:          '#0e0f15',
    foreground:          '#d3d5d9',
    cursor:              '#8190d3',
    selectionBackground: '#8190d340',
    black:               '#191c27',
    red:                 '#d97a7a',
    green:               '#7ac9a0',
    yellow:              '#d4b46a',
    blue:                '#5468c4',
    magenta:             '#b98fc9',
    cyan:                '#6fc2d9',
    white:               '#d3d5d9',
    brightBlack:         '#7d8399',
    brightRed:           '#f0948a',
    brightGreen:         '#94dcb8',
    brightYellow:        '#f0cf94',
    brightBlue:          '#7f94e0',
    brightMagenta:       '#d4aee0',
    brightCyan:          '#94dcea',
    brightWhite:         '#fdfeff',
  },
  'atreus-light': {
    background:          '#edeff5',
    foreground:          '#1f2025',
    cursor:              '#2c3a6e',
    selectionBackground: '#2c3a6e40',
    black:               '#3a4055',
    red:                 '#a8433f',
    green:               '#3f7a5c',
    yellow:              '#92721f',
    blue:                '#2c3a6e',
    magenta:             '#7a4a8a',
    cyan:                '#257d8a',
    white:               '#1f2025',
    brightBlack:         '#464b55',
    brightRed:           '#d1685a',
    brightGreen:         '#5c9d7c',
    brightYellow:        '#b9963f',
    brightBlue:          '#4a5da8',
    brightMagenta:       '#a866a8',
    brightCyan:          '#3f9dad',
    brightWhite:         '#0d0f18',
  },
  // A colleague's own custom theme, "graduated" to a built-in family after he
  // kept coming back to it — pure neutral grays, no hue at all (unlike every
  // other family, each tied to a colored accent). Reuses claude-dark/light's
  // ANSI 16-color palette verbatim, same as Luuk above — a purely gray theme
  // still needs colorful, legible `git status`/CLI output; only background,
  // foreground, cursor, selection and the white slots go monochrome.
  'gabriele-dark': {
    background:          '#3c3c3c',
    foreground:          '#f7f7f7',
    cursor:              '#b7b7b7',
    selectionBackground: '#b7b7b740',
    black:               '#2a2a2a',
    red:                 '#e06c75',
    green:               '#98c379',
    yellow:              '#e5c07b',
    blue:                '#61afef',
    magenta:             '#c678dd',
    cyan:                '#56b6c2',
    white:               '#f7f7f7',
    brightBlack:         '#a6a6a6',
    brightRed:           '#f07178',
    brightGreen:         '#a8e0a0',
    brightYellow:        '#f0d090',
    brightBlue:          '#82c0ff',
    brightMagenta:       '#d8a0f0',
    brightCyan:          '#7cd0dc',
    brightWhite:         '#ffffff',
  },
  'gabriele-light': {
    background:          '#f1f1f1',
    foreground:          '#222222',
    cursor:              '#5c5c5c',
    selectionBackground: '#5c5c5c40',
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
    brightWhite:         '#2b2b2b',
  },
}

// "glass" panel style needs the terminal surface itself to be see-through,
// not just its wrapper div — xterm paints its own opaque background from
// ITheme.background, independent of the --color-bg CSS custom property the
// rest of the UI uses. Matches --color-bg's glass alpha in index.css so the
// terminal blends with the same transparency as its own wrapper panel.
export const XTERM_GLASS_ALPHA = 0.2

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
  { id: 'claude-dark',  name: 'Claude Dark',  swatches: ['#111111', '#1b1b1b', '#161616', '#db7d5e', '#333333'] },
  { id: 'claude-light', name: 'Claude Light', swatches: ['#f1f1f1', '#ededed', '#fefefe', '#9a4c2f', '#dadada'] },
  { id: 'thomas-dark',  name: 'vIDE Dark',  swatches: ['#0f1115', '#161a21', '#161a21', '#ffb020', '#262d38'] },
  { id: 'thomas-light', name: 'vIDE Light', swatches: ['#eceef2', '#f6f7f9', '#ffffff', '#9a5b00', '#dfe3e9'] },
  { id: 'link-dark',    name: 'Link Dark',    swatches: ['#11150e', '#1a2016', '#161b12', '#9ac26a', '#323d29'] },
  { id: 'link-light',   name: 'Link Light',   swatches: ['#fbfbe6', '#f9fbe0', '#fffffd', '#597232', '#f3f6be'] },
  { id: 'atreus-dark',  name: 'Atreus Dark',  swatches: ['#0e0f15', '#151720', '#12141b', '#8190d3', '#282d3e'] },
  { id: 'atreus-light', name: 'Atreus Light', swatches: ['#edeff5', '#e9ebf2', '#fdfefe', '#2c3a6e', '#d0d6e4'] },
  // "Borahae" (BTS/ARMY's "I purple you") — see the note on XTERM_THEMES above.
  { id: 'borahae-dark',  name: 'Borahae Dark',  swatches: ['#100e15', '#181520', '#14121b', '#a17cf8', '#2e283e'] },
  { id: 'borahae-light', name: 'Borahae Light', swatches: ['#efe9f9', '#ebe3f7', '#fefdfe', '#6d28d9', '#d6c5ef'] },
  // "Gabriele" — see the note on XTERM_THEMES above.
  { id: 'gabriele-dark',  name: 'Gabriele Dark',  swatches: ['#3c3c3c', '#3c3c3c', '#363636', '#b7b7b7', '#262626'] },
  { id: 'gabriele-light', name: 'Gabriele Light', swatches: ['#f1f1f1', '#ededed', '#fefefe', '#5c5c5c', '#dadada'] },
  // Luuk hates light mode — "Luuk Light" is a gag, identical to "Luuk Dark".
  { id: 'luuk-dark',    name: 'Luuk Dark',    swatches: ['#0b0b0b', '#0f0f0f', '#121212', '#9e9e9e', '#2b2b2b'] },
  { id: 'luuk-light',   name: 'Luuk Light',   swatches: ['#0b0b0b', '#0f0f0f', '#121212', '#9e9e9e', '#2b2b2b'] },
]
