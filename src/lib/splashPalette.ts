// Colours for the boot sync splash (src/components/BootSplash/SyncSplash.tsx).
//
// Deliberately standalone: it must NOT import themeStore/customThemeStore.
// Those modules read localStorage and apply the theme at import time, and the
// whole point of the pre-boot pull is that they load only after it has landed.
// Built-in colours come from index.css via a detached probe element instead.

export interface SplashPalette {
  bg: string
  accent: string
  isLight: boolean
}

// What the splash shows until the synced theme is known.
export const DEFAULT_SPLASH_PALETTE: SplashPalette = {
  bg: '#141414',
  accent: '#9e9e9e',
  isLight: false,
}

export interface SplashPaletteDeps {
  getItem: (key: string) => string | null
  systemPrefersDark: () => boolean
  readBuiltIn: (themeId: string) => { bg: string; accent: string } | null
}

const HEX = /^#[0-9a-f]{6}$/i
const THEME_ID = /^[a-z0-9]+-(dark|light)$/

function isLightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const luma = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luma > 0.5
}

function validHex(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value) ? value : null
}

// The active custom theme's palette for `variant`, or {} when there is none
// (or the stored JSON is unusable — custom themes are best-effort here).
function activeCustomPalette(raw: string | null, variant: 'dark' | 'light'): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const active = Array.isArray(parsed?.themes)
      ? parsed.themes.find((t: { id?: unknown }) => t?.id === parsed.activeId)
      : undefined
    const palette = active?.[variant]
    return typeof palette === 'object' && palette !== null ? palette : {}
  } catch {
    return {}
  }
}

export function resolveSplashPalette(deps: SplashPaletteDeps): SplashPalette {
  const stored = deps.getItem('vide:theme')
  let themeId = stored && THEME_ID.test(stored) ? stored : 'claude-dark'
  if (deps.getItem('vide:themeMatchSystem') === 'true') {
    const family = themeId.replace(/-(dark|light)$/, '')
    themeId = `${family}-${deps.systemPrefersDark() ? 'dark' : 'light'}`
  }

  const builtIn = deps.readBuiltIn(themeId)
  const custom = activeCustomPalette(
    deps.getItem('vide:customThemes'),
    themeId.endsWith('-dark') ? 'dark' : 'light',
  )

  const bg = validHex(custom['--color-bg']) ?? builtIn?.bg ?? DEFAULT_SPLASH_PALETTE.bg
  const accent = validHex(custom['--color-accent']) ?? builtIn?.accent ?? DEFAULT_SPLASH_PALETTE.accent
  return { bg, accent, isLight: isLightColor(bg) }
}

// index.css stores the accent as "R G B" (for Tailwind opacity modifiers).
function rgbSpaceToHex(raw: string): string | null {
  const parts = raw.split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null
  return '#' + parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
}

// Reads a built-in theme's ground and accent from index.css by letting a
// hidden element pick up that theme's [data-theme] rule. <html> is never
// touched, so no theme is applied to the app as a side effect.
export function readBuiltInThemeVars(themeId: string): { bg: string; accent: string } | null {
  const probe = document.createElement('div')
  probe.setAttribute('data-theme', themeId)
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  try {
    const styles = getComputedStyle(probe)
    const bg = validHex(styles.getPropertyValue('--color-bg').trim())
    const accent = rgbSpaceToHex(styles.getPropertyValue('--color-accent').trim())
    return bg && accent ? { bg, accent } : null
  } finally {
    probe.remove()
  }
}

export function loadSplashPalette(): SplashPalette {
  return resolveSplashPalette({
    getItem: (key) => {
      try { return localStorage.getItem(key) } catch { return null }
    },
    systemPrefersDark: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    readBuiltIn: readBuiltInThemeVars,
  })
}
