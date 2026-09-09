import type { Monaco } from '@monaco-editor/react'
import type { ThemeId } from '@/stores/themeStore'
import { hexWithAlpha, hexToHsv, hsvToHex } from '@/lib/color'

interface ThemePalette {
  base: 'vs' | 'vs-dark'
  background: string
  foreground: string
  accent: string
  border: string
  fgMuted: string
  fgSubtle: string
}

// Mirrors the hex values in index.css / themeStore's XTERM_THEMES — Monaco's
// theming API needs literal colors, it can't read our CSS custom properties.
export const THEME_PALETTES: Record<ThemeId, ThemePalette> = {
  'claude-dark':  { base: 'vs-dark', background: '#1e1e1e', foreground: '#cccccc', accent: '#d97757', border: '#3c3c3c', fgMuted: '#858585', fgSubtle: '#555555' },
  'claude-light': { base: 'vs',      background: '#ffffff', foreground: '#1e1e1e', accent: '#c4613d', border: '#e0e0e0', fgMuted: '#717171', fgSubtle: '#999999' },
  'thomas-dark':  { base: 'vs-dark', background: '#221c15', foreground: '#e8e0d0', accent: '#f5c242', border: '#4a3d29', fgMuted: '#9c9080', fgSubtle: '#665c4a' },
  'thomas-light': { base: 'vs',      background: '#fffcf2', foreground: '#2a2013', accent: '#ad7b00', border: '#d8c89a', fgMuted: '#74684f', fgSubtle: '#a89876' },
  // Both "dark" — Luuk hates light mode, so "Luuk Light" is a gag entry
  // identical to "Luuk Dark", base 'vs-dark' included.
  'luuk-dark':    { base: 'vs-dark', background: '#141414', foreground: '#d4d4d4', accent: '#9e9e9e', border: '#2e2e2e', fgMuted: '#8a8a8a', fgSubtle: '#525252' },
  'luuk-light':   { base: 'vs-dark', background: '#141414', foreground: '#d4d4d4', accent: '#9e9e9e', border: '#2e2e2e', fgMuted: '#8a8a8a', fgSubtle: '#525252' },
  'borahae-dark':  { base: 'vs-dark', background: '#1b1728', foreground: '#e8e0f5', accent: '#8b5cf6', border: '#3d3552', fgMuted: '#a99cc4', fgSubtle: '#6f6389' },
  'borahae-light': { base: 'vs',      background: '#fdfcff', foreground: '#241b38', accent: '#6d28d9', border: '#d4c2ec', fgMuted: '#6b5c87', fgSubtle: '#9c8fb8' },
  'link-dark':    { base: 'vs-dark', background: '#171c13', foreground: '#eef0d5', accent: '#9ac26a', border: '#3a4a2c', fgMuted: '#9aa084', fgSubtle: '#5f6650' },
  'link-light':   { base: 'vs',      background: '#fffef2', foreground: '#3a2f1e', accent: '#6b8a3d', border: '#c9c093', fgMuted: '#7a6b4f', fgSubtle: '#a89b78' },
  'atreus-dark':  { base: 'vs-dark', background: '#171b28', foreground: '#e4e7f2', accent: '#5468c4', border: '#3a4460', fgMuted: '#8b93b0', fgSubtle: '#4f5670' },
  'atreus-light': { base: 'vs',      background: '#f8f9fc', foreground: '#1c2233', accent: '#2c3a6e', border: '#c2c8dc', fgMuted: '#5c6480', fgSubtle: '#8b93b0' },
  'gabriele-dark':  { base: 'vs-dark', background: '#4e4e4e', foreground: '#cccccc', accent: '#828282', border: '#3c3c3c', fgMuted: '#a3a3a3', fgSubtle: '#858585' },
  'gabriele-light': { base: 'vs',      background: '#ffffff', foreground: '#2b2b2b', accent: '#5c5c5c', border: '#d4d4d4', fgMuted: '#737373', fgSubtle: '#999999' },
}

export interface HighContrastTokens {
  keyword: string
  string: string
  number: string
  type: string
  comment: string
}

// One bright palette per theme family, tied to that theme's own accent hue
// rather than a single generic scheme — picking Claude with High Contrast
// on should still look like Claude, just far more legible. Background and
// base foreground are untouched (see defineMonacoThemes below); only these
// five token categories get overridden. Luuk only needs one entry — its
// "light" variant is already identical to "dark" in THEME_PALETTES.
export const HIGH_CONTRAST_TOKENS: Record<ThemeId, HighContrastTokens> = {
  'claude-dark':   { keyword: '#ff6b35', string: '#00d9c0', number: '#ffd23f', type: '#ff5c8a', comment: '#d9905c' },
  'claude-light':  { keyword: '#e8491d', string: '#00796b', number: '#a6720a', type: '#c2185b', comment: '#8a5a3c' },
  'thomas-dark':   { keyword: '#ffd60a', string: '#b4ff39', number: '#ff9f1c', type: '#2ee6c8', comment: '#c9a876' },
  'thomas-light':  { keyword: '#a67c00', string: '#5c7a1e', number: '#b35900', type: '#00796b', comment: '#8a7350' },
  'luuk-dark':     { keyword: '#ffffff', string: '#cfcfcf', number: '#a8a8a8', type: '#e0e0e0', comment: '#707070' },
  'luuk-light':    { keyword: '#ffffff', string: '#cfcfcf', number: '#a8a8a8', type: '#e0e0e0', comment: '#707070' },
  'borahae-dark':  { keyword: '#b794f6', string: '#ff6ec7', number: '#ffd23f', type: '#4de6e6', comment: '#9c8fc4' },
  'borahae-light': { keyword: '#5b21b6', string: '#c2185b', number: '#a6720a', type: '#00796b', comment: '#6b5c87' },
  'link-dark':     { keyword: '#7fff3f', string: '#ffd23f', number: '#4de6c8', type: '#ff6b6b', comment: '#a89b6a' },
  'link-light':    { keyword: '#2d6a1f', string: '#9a6b00', number: '#007a6b', type: '#b33f2e', comment: '#7a6b3d' },
  'atreus-dark':   { keyword: '#5b8cff', string: '#3fe0ff', number: '#ffb43f', type: '#c17bff', comment: '#7a86b8' },
  'atreus-light':  { keyword: '#1a3fcc', string: '#00707a', number: '#a6650a', type: '#6a1fb3', comment: '#5a6486' },
  // Gabriele's own accent has no hue at all (pure gray, s=0) — run through
  // deriveHighContrastTokens below anyway rather than picking one by eye,
  // same formula every custom theme gets: the hue offsets still produce four
  // distinct real hues even starting from a desaturated accent.
  'gabriele-dark':  { keyword: '#f25555', string: '#8955f2', number: '#f2cb55', type: '#55f2a4', comment: '#a67070' },
  'gabriele-light': { keyword: '#991717', string: '#421799', number: '#997817', type: '#179958', comment: '#734242' },
}

// "Mario Mode" — a single, universal maximum-contrast scheme rather than
// one bright variant per theme like High Contrast above. It ignores the
// active app Theme entirely (fixed black background, fixed palette) since
// its whole purpose is the most legible option available, independent of
// whatever look the rest of the app happens to be using.
export const MARIO_MODE_THEME_ID = 'mario-mode'

export const MARIO_MODE_BASE = {
  background: '#000000',
  foreground: '#ffffff',
  accent: '#e52521',
  border: '#4d4d4d',
  fgMuted: '#bbbbbb',
  fgSubtle: '#888888',
}

export const MARIO_MODE_TOKENS: HighContrastTokens = {
  keyword: '#fbd000',
  string: '#00a651',
  number: '#049cd8',
  type: '#e52521',
  comment: '#e8a33d',
}

// Approximates Monaco's own built-in vs/vs-dark default token colors — the
// "Default" scheme literally is those stock colors (see the empty `rules: []`
// below), so the Editor Colors picker's Default card preview needs the real
// values rather than inventing its own. Keyed by base, not by theme, since
// the default palette doesn't vary with the app's accent.
export const DEFAULT_TOKENS: Record<'vs' | 'vs-dark', HighContrastTokens> = {
  'vs-dark': { keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', type: '#4ec9b0', comment: '#6a9955' },
  'vs':      { keyword: '#0000ff', string: '#a31515', number: '#098658', type: '#267f99', comment: '#008000' },
}

function stripHash(hex: string): string {
  return hex.replace('#', '')
}

// Matches --color-panel's glass alpha in index.css so the editor surface
// blends with the same transparency as its own wrapper panel.
const GLASS_ALPHA = 0.25

// Shared by every per-family theme in defineMonacoThemes below and by
// defineCustomDefaultTheme's custom-background variant — everything except
// 'editor.background' itself, which each caller substitutes separately (the
// literal family colour, a glass-alpha'd version of it, or a custom theme's
// own background).
function baseEditorColors(p: ThemePalette) {
  return {
    'editor.foreground':                   p.foreground,
    'editorCursor.foreground':              p.accent,
    'editor.selectionBackground':           p.accent + '40',
    'editor.inactiveSelectionBackground':   p.accent + '20',
    'editor.lineHighlightBackground':       p.accent + '12',
    'editorLineNumber.foreground':          p.fgSubtle,
    'editorLineNumber.activeForeground':    p.fgMuted,
    'editorIndentGuide.background':         p.border,
    'editorIndentGuide.activeBackground':   p.fgSubtle,
    'editorWhitespace.foreground':          p.border,
  }
}

// Auto-derives High Contrast Editor Colors for a CUSTOM theme. The per-family
// HIGH_CONTRAST_TOKENS above are hand-picked and know nothing about a custom
// theme's own colours, so turning on High Contrast while a custom theme was
// active used to fall back to the *base family's* fixed bright palette —
// which could clash with, or barely contrast against, whatever the user
// actually picked. This computes an equivalent instead of hand-picking one:
// five token hues spaced around the custom theme's own accent (mirroring how
// every HIGH_CONTRAST_TOKENS entry above stays tied to its theme's accent),
// pushed to near-max saturation/value against a dark background or a darker,
// more saturated value against a light one for legibility either way.
// Comment stays a desaturated, dimmed version of that same hue rather than a
// sixth competing one, matching how comments read as supporting colour in
// every hand-picked palette above rather than a foreground one.
const TOKEN_HUE_OFFSET = { keyword: 0, type: 150, string: 260, number: 45 } as const

export function deriveHighContrastTokens(accentHex: string, backgroundHex: string): HighContrastTokens {
  const { h } = hexToHsv(accentHex)
  const bgIsDark = hexToHsv(backgroundHex).v < 0.5
  const s = bgIsDark ? 0.65 : 0.85
  const v = bgIsDark ? 0.95 : 0.6
  const hue = (offset: number) => (h + offset) % 360
  return {
    keyword: hsvToHex(hue(TOKEN_HUE_OFFSET.keyword), s, v),
    type: hsvToHex(hue(TOKEN_HUE_OFFSET.type), s, v),
    string: hsvToHex(hue(TOKEN_HUE_OFFSET.string), s, v),
    number: hsvToHex(hue(TOKEN_HUE_OFFSET.number), s, v),
    comment: hsvToHex(h, s * 0.5, bgIsDark ? 0.65 : 0.45),
  }
}

// Stable id — unlike the per-family ids above, this one theme definition gets
// redefined in place (monaco.editor.defineTheme() is safe to call again with
// the same id) whenever the active custom theme's own colours change, rather
// than one static id per ThemeId.
export const CUSTOM_HIGH_CONTRAST_THEME_ID = 'custom-theme-hc'

export interface CustomHighContrastPalette {
  background: string
  foreground: string
  accent: string
  border: string
  fgMuted: string
  fgSubtle: string
}

// Default Editor Colors on a custom theme. Mirrors effectiveXtermTheme in
// customThemeStore.ts: Monaco's syntax token colours keep following the base
// family (that IS what "Default — follows the active theme's own syntax
// colours" means; a custom theme only ever defines the 9 chrome vars, not
// token colours), but leaving the editor on the base family's own stock
// background while every other panel follows the custom theme's background
// reads as a bug, not a design choice — same reasoning that already applies
// to the terminal below. baseThemeId supplies the inherited family's token/
// foreground colours; customBackground substitutes only 'editor.background'.
export const CUSTOM_DEFAULT_THEME_ID = 'custom-theme-default'

export function defineCustomDefaultTheme(monaco: Monaco, baseThemeId: ThemeId, customBackground: string, glass: boolean) {
  const p = THEME_PALETTES[baseThemeId]
  monaco.editor.defineTheme(CUSTOM_DEFAULT_THEME_ID, {
    base: p.base,
    inherit: true,
    rules: [],
    colors: {
      ...baseEditorColors(p),
      'editor.background': glass ? hexWithAlpha(customBackground, GLASS_ALPHA) : customBackground,
    },
  })
}

export function defineCustomHighContrastTheme(monaco: Monaco, palette: CustomHighContrastPalette, glass: boolean) {
  const base: 'vs' | 'vs-dark' = hexToHsv(palette.background).v < 0.5 ? 'vs-dark' : 'vs'
  const tokens = deriveHighContrastTokens(palette.accent, palette.background)
  monaco.editor.defineTheme(CUSTOM_HIGH_CONTRAST_THEME_ID, {
    base,
    inherit: true,
    rules: [
      { token: 'comment', foreground: stripHash(tokens.comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: stripHash(tokens.keyword) },
      { token: 'string', foreground: stripHash(tokens.string) },
      { token: 'number', foreground: stripHash(tokens.number) },
      { token: 'type.identifier', foreground: stripHash(tokens.type) },
      { token: 'regexp', foreground: stripHash(tokens.string) },
      { token: 'delimiter', foreground: stripHash(palette.fgMuted) },
    ],
    colors: {
      'editor.foreground':                   palette.foreground,
      'editor.background':                   glass ? hexWithAlpha(palette.background, GLASS_ALPHA) : palette.background,
      'editorCursor.foreground':              palette.accent,
      'editor.selectionBackground':           palette.accent + '40',
      'editor.inactiveSelectionBackground':   palette.accent + '20',
      'editor.lineHighlightBackground':       palette.accent + '12',
      'editorLineNumber.foreground':          palette.fgSubtle,
      'editorLineNumber.activeForeground':    palette.fgMuted,
      'editorIndentGuide.background':         palette.border,
      'editorIndentGuide.activeBackground':   palette.fgSubtle,
      'editorWhitespace.foreground':          palette.border,
    },
  })
}

// "glass" panel style needs the editor surface itself to be see-through, not
// just its wrapper div — Monaco paints its own opaque background from this
// theme's 'editor.background' color, independent of the --color-panel CSS
// custom property the rest of the UI uses, so a plain CSS opacity change on
// the wrapper has no visible effect on the actual editing surface.
export function glassMonacoThemeId(id: ThemeId): string {
  return `${id}-glass`
}

// The Theme Colour Match Editor Colors scheme ('high-contrast' internally —
// see HIGH_CONTRAST_TOKENS above).
export function highContrastMonacoThemeId(id: ThemeId): string {
  return `${id}-hc`
}

// Glass-panel-style variant of the above — only Mario Mode (MARIO_MODE_THEME_ID)
// always stays fully opaque regardless of panel style, since ignoring the
// active theme entirely is the point of that one. Theme Colour Match is
// meant to still read as "this theme, with easier-to-read syntax colours" —
// forcing it opaque under Glass would silently drop the panel style the user
// picked, the same bug defineCustomDefaultTheme/CUSTOM_DEFAULT_THEME_ID above
// already fixed for the Default scheme.
export function glassHighContrastMonacoThemeId(id: ThemeId): string {
  return `${id}-hc-glass`
}

let defined = false

export function defineMonacoThemes(monaco: Monaco) {
  if (defined) return
  defined = true

  for (const [id, p] of Object.entries(THEME_PALETTES) as [ThemeId, ThemePalette][]) {
    const colors = baseEditorColors(p)
    monaco.editor.defineTheme(id, {
      base: p.base,
      inherit: true,
      rules: [],
      colors: { ...colors, 'editor.background': p.background },
    })
    monaco.editor.defineTheme(glassMonacoThemeId(id), {
      base: p.base,
      inherit: true,
      rules: [],
      colors: { ...colors, 'editor.background': hexWithAlpha(p.background, GLASS_ALPHA) },
    })

    // Theme Colour Match keeps this theme's own foreground — only the syntax
    // token colors change — but, like Default, still follows the Glass panel
    // style rather than forcing itself opaque (see glassHighContrastMonacoThemeId).
    const hc = HIGH_CONTRAST_TOKENS[id]
    const hcRules = [
      { token: 'comment', foreground: stripHash(hc.comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: stripHash(hc.keyword) },
      { token: 'string', foreground: stripHash(hc.string) },
      { token: 'number', foreground: stripHash(hc.number) },
      { token: 'type.identifier', foreground: stripHash(hc.type) },
      { token: 'regexp', foreground: stripHash(hc.string) },
      { token: 'delimiter', foreground: stripHash(p.fgMuted) },
    ]
    monaco.editor.defineTheme(highContrastMonacoThemeId(id), {
      base: p.base,
      inherit: true,
      rules: hcRules,
      colors: { ...colors, 'editor.background': p.background },
    })
    monaco.editor.defineTheme(glassHighContrastMonacoThemeId(id), {
      base: p.base,
      inherit: true,
      rules: hcRules,
      colors: { ...colors, 'editor.background': hexWithAlpha(p.background, GLASS_ALPHA) },
    })
  }

  // Mario Mode — defined once, not per-theme (see MARIO_MODE_THEME_ID above).
  const m = MARIO_MODE_BASE
  monaco.editor.defineTheme(MARIO_MODE_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: stripHash(MARIO_MODE_TOKENS.comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: stripHash(MARIO_MODE_TOKENS.keyword) },
      { token: 'string', foreground: stripHash(MARIO_MODE_TOKENS.string) },
      { token: 'number', foreground: stripHash(MARIO_MODE_TOKENS.number) },
      { token: 'type.identifier', foreground: stripHash(MARIO_MODE_TOKENS.type) },
      { token: 'regexp', foreground: stripHash(MARIO_MODE_TOKENS.string) },
      { token: 'delimiter', foreground: stripHash(m.fgMuted) },
    ],
    colors: {
      'editor.foreground':                   m.foreground,
      'editorCursor.foreground':              m.accent,
      'editor.selectionBackground':           m.accent + '55',
      'editor.inactiveSelectionBackground':   m.accent + '30',
      'editor.lineHighlightBackground':       m.accent + '20',
      'editorLineNumber.foreground':          m.fgSubtle,
      'editorLineNumber.activeForeground':    m.fgMuted,
      'editorIndentGuide.background':         m.border,
      'editorIndentGuide.activeBackground':   m.fgSubtle,
      'editorWhitespace.foreground':          m.border,
      'editor.background':                   m.background,
    },
  })
}
