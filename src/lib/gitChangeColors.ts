// Colours and strength for the editor's git change markers (gutter line
// numbers, line tint, changed-word highlight), set as CSS variables on the
// root element and read by the .git-gutter-* / .git-line-* /
// .git-inline-diff-modified rules in src/index.css. Default mode sets no
// colour variables, so the stylesheet's own dark/light-theme values apply.

export type ChangeColorMode = 'default' | 'custom'
export type ChangeStrength = 'subtle' | 'medium' | 'strong'

export interface ChangeColors {
  added: string
  modified: string
  deleted: string
}

// Starting point for Custom: the same hues Default uses on dark themes.
export const DEFAULT_CUSTOM_CHANGE_COLORS: ChangeColors = {
  added: '#4ade80',
  modified: '#fbbf24',
  deleted: '#f87171',
}

const STRENGTH: Record<ChangeStrength, { wash: string; word: string }> = {
  subtle: { wash: '6%', word: '15%' },
  medium: { wash: '10%', word: '22%' },
  strong: { wash: '18%', word: '40%' },
}

// null means "remove the inline override".
export function gitChangeCssVars(
  mode: ChangeColorMode,
  custom: ChangeColors,
  strength: ChangeStrength,
): Record<string, string | null> {
  const useCustom = mode === 'custom'
  return {
    '--git-added': useCustom ? custom.added : null,
    '--git-modified': useCustom ? custom.modified : null,
    '--git-deleted': useCustom ? custom.deleted : null,
    '--git-wash': STRENGTH[strength].wash,
    '--git-word': STRENGTH[strength].word,
  }
}

export function applyGitChangeColors(mode: ChangeColorMode, custom: ChangeColors, strength: ChangeStrength): void {
  if (typeof document === 'undefined') return
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(gitChangeCssVars(mode, custom, strength))) {
    if (value === null) style.removeProperty(name)
    else style.setProperty(name, value)
  }
}

// Monaco paints scrollbar (overview ruler) marks itself and takes a literal
// colour, not a CSS variable, so the current --git-* value is resolved from
// the root element at the time the marks are set. Falls back to the dark-
// theme defaults outside a DOM.
export function gitChangeRulerColor(type: keyof ChangeColors): string {
  if (typeof document === 'undefined') return DEFAULT_CUSTOM_CHANGE_COLORS[type]
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--git-${type}`).trim()
  return value || DEFAULT_CUSTOM_CHANGE_COLORS[type]
}
