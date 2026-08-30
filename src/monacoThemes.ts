import type { Monaco } from '@monaco-editor/react'
import type { ThemeId } from '@/stores/themeStore'
import { hexWithAlpha } from '@/lib/color'

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
const THEME_PALETTES: Record<ThemeId, ThemePalette> = {
  'claude-dark':  { base: 'vs-dark', background: '#1e1e1e', foreground: '#cccccc', accent: '#d97757', border: '#3c3c3c', fgMuted: '#858585', fgSubtle: '#555555' },
  'claude-light': { base: 'vs',      background: '#ffffff', foreground: '#1e1e1e', accent: '#c4613d', border: '#e0e0e0', fgMuted: '#717171', fgSubtle: '#999999' },
  'thomas-dark':  { base: 'vs-dark', background: '#221c15', foreground: '#e8e0d0', accent: '#f5c242', border: '#4a3d29', fgMuted: '#9c9080', fgSubtle: '#665c4a' },
  'thomas-light': { base: 'vs',      background: '#fffcf2', foreground: '#2a2013', accent: '#ad7b00', border: '#d8c89a', fgMuted: '#74684f', fgSubtle: '#a89876' },
  // Both "dark" — Luuk hates light mode, so "Luuk Light" is a gag entry
  // identical to "Luuk Dark", base 'vs-dark' included.
  'luuk-dark':    { base: 'vs-dark', background: '#141414', foreground: '#d4d4d4', accent: '#9e9e9e', border: '#2e2e2e', fgMuted: '#8a8a8a', fgSubtle: '#525252' },
  'luuk-light':   { base: 'vs-dark', background: '#141414', foreground: '#d4d4d4', accent: '#9e9e9e', border: '#2e2e2e', fgMuted: '#8a8a8a', fgSubtle: '#525252' },
  'link-dark':    { base: 'vs-dark', background: '#171c13', foreground: '#eef0d5', accent: '#9ac26a', border: '#3a4a2c', fgMuted: '#9aa084', fgSubtle: '#5f6650' },
  'link-light':   { base: 'vs',      background: '#fffef2', foreground: '#3a2f1e', accent: '#6b8a3d', border: '#c9c093', fgMuted: '#7a6b4f', fgSubtle: '#a89b78' },
  'atreus-dark':  { base: 'vs-dark', background: '#171b28', foreground: '#e4e7f2', accent: '#5468c4', border: '#3a4460', fgMuted: '#8b93b0', fgSubtle: '#4f5670' },
  'atreus-light': { base: 'vs',      background: '#f8f9fc', foreground: '#1c2233', accent: '#2c3a6e', border: '#c2c8dc', fgMuted: '#5c6480', fgSubtle: '#8b93b0' },
}

// "glass" panel style needs the editor surface itself to be see-through, not
// just its wrapper div — Monaco paints its own opaque background from this
// theme's 'editor.background' color, independent of the --color-panel CSS
// custom property the rest of the UI uses, so a plain CSS opacity change on
// the wrapper has no visible effect on the actual editing surface.
export function glassMonacoThemeId(id: ThemeId): string {
  return `${id}-glass`
}

// Matches --color-panel's glass alpha in index.css so the editor surface
// blends with the same transparency as its own wrapper panel.
const GLASS_ALPHA = 0.25

let defined = false

export function defineMonacoThemes(monaco: Monaco) {
  if (defined) return
  defined = true

  for (const [id, p] of Object.entries(THEME_PALETTES) as [ThemeId, ThemePalette][]) {
    const colors = {
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
  }
}
