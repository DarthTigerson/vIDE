import { describe, it, expect, vi } from 'vitest'
import { resolveSplashPalette, DEFAULT_SPLASH_PALETTE } from '../splashPalette'

const BUILT_IN: Record<string, { bg: string; accent: string }> = {
  'claude-dark': { bg: '#1a1a1a', accent: '#d97757' },
  'claude-light': { bg: '#f5f5f3', accent: '#c4613d' },
  'atreus-dark': { bg: '#12151f', accent: '#5468c4' },
  'link-dark': { bg: '#12160f', accent: '#9ac26a' },
  'link-light': { bg: '#f2f5ec', accent: '#6b8a3d' },
}

function setup(
  storage: Record<string, string>,
  opts: { systemDark?: boolean } = {},
) {
  const readBuiltIn = vi.fn((id: string) => BUILT_IN[id] ?? null)
  const palette = resolveSplashPalette({
    getItem: (k) => storage[k] ?? null,
    systemPrefersDark: () => opts.systemDark ?? true,
    readBuiltIn,
  })
  return { palette, readBuiltIn }
}

const customThemes = (activeId: string | null, dark: object, light: object = {}) =>
  JSON.stringify({
    themes: [{ id: 't1', name: 'Mine', baseFamily: 'claude', dark, light }],
    activeId,
  })

describe('resolveSplashPalette', () => {
  it('uses the stored built-in theme', () => {
    const { palette } = setup({ 'vide:theme': 'atreus-dark' })
    expect(palette).toEqual({ bg: '#12151f', accent: '#5468c4', isLight: false })
  })

  it('falls back to claude-dark when no theme is stored', () => {
    const { palette, readBuiltIn } = setup({})
    expect(readBuiltIn).toHaveBeenCalledWith('claude-dark')
    expect(palette.accent).toBe('#d97757')
  })

  it('marks a light theme as light so the label can stay readable', () => {
    const { palette } = setup({ 'vide:theme': 'claude-light' })
    expect(palette.isLight).toBe(true)
  })

  it('follows the system variant of the stored family when match-system is on', () => {
    const { readBuiltIn } = setup(
      { 'vide:theme': 'link-light', 'vide:themeMatchSystem': 'true' },
      { systemDark: true },
    )
    expect(readBuiltIn).toHaveBeenCalledWith('link-dark')
  })

  it('ignores the system variant when match-system is off', () => {
    const { readBuiltIn } = setup(
      { 'vide:theme': 'link-light', 'vide:themeMatchSystem': 'false' },
      { systemDark: true },
    )
    expect(readBuiltIn).toHaveBeenCalledWith('link-light')
  })

  it('uses the active custom theme palette for the current variant', () => {
    const { palette } = setup({
      'vide:theme': 'claude-dark',
      'vide:customThemes': customThemes('t1', { '--color-bg': '#0f1a1c', '--color-accent': '#2dd4bf' }),
    })
    expect(palette).toEqual({ bg: '#0f1a1c', accent: '#2dd4bf', isLight: false })
  })

  it('uses the custom theme light palette under a light variant', () => {
    const { palette } = setup({
      'vide:theme': 'claude-light',
      'vide:customThemes': customThemes(
        't1',
        { '--color-bg': '#000000', '--color-accent': '#000000' },
        { '--color-bg': '#fafafa', '--color-accent': '#2255cc' },
      ),
    })
    expect(palette).toEqual({ bg: '#fafafa', accent: '#2255cc', isLight: true })
  })

  it('ignores custom themes when none is active', () => {
    const { palette } = setup({
      'vide:theme': 'claude-dark',
      'vide:customThemes': customThemes(null, { '--color-bg': '#0f1a1c', '--color-accent': '#2dd4bf' }),
    })
    expect(palette.accent).toBe('#d97757')
  })

  it('falls back to the built-in colour for a custom value that is not a hex colour', () => {
    const { palette } = setup({
      'vide:theme': 'claude-dark',
      'vide:customThemes': customThemes('t1', { '--color-bg': 'red', '--color-accent': '#2dd4bf' }),
    })
    expect(palette).toEqual({ bg: '#1a1a1a', accent: '#2dd4bf', isLight: false })
  })

  it('falls back to the built-in theme when custom theme JSON is corrupt', () => {
    const { palette } = setup({ 'vide:theme': 'atreus-dark', 'vide:customThemes': '{not json' })
    expect(palette.accent).toBe('#5468c4')
  })

  it('treats a malformed stored theme id as claude-dark rather than probing it', () => {
    const { readBuiltIn } = setup({ 'vide:theme': '"][x' })
    expect(readBuiltIn).toHaveBeenCalledWith('claude-dark')
  })

  it('uses the default palette when the theme cannot be resolved at all', () => {
    const { palette } = setup({ 'vide:theme': 'nonesuch-dark' })
    expect(palette).toEqual(DEFAULT_SPLASH_PALETTE)
  })

  it('has a neutral grey default', () => {
    expect(DEFAULT_SPLASH_PALETTE).toEqual({ bg: '#141414', accent: '#9e9e9e', isLight: false })
  })
})
