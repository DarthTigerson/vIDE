// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readBuiltInThemeVars, loadSplashPalette } from '../splashPalette'

// Stand-in for index.css: the same [data-theme] rules, accent stored as "R G B".
const THEME_CSS = `
  [data-theme="atreus-dark"] { --color-bg: #12151f; --color-accent: 84 104 196; }
  [data-theme="claude-dark"] { --color-bg: #1a1a1a; --color-accent: 217 119 87; }
  [data-theme="claude-light"] { --color-bg: #f5f5f3; --color-accent: 196 97 61; }
`

let style: HTMLStyleElement

beforeEach(() => {
  style = document.createElement('style')
  style.textContent = THEME_CSS
  document.head.appendChild(style)
  localStorage.clear()
  // jsdom has no matchMedia.
  window.matchMedia = ((q: string) => ({ matches: q.includes('dark') })) as typeof window.matchMedia
})

afterEach(() => {
  style.remove()
  document.documentElement.removeAttribute('data-theme')
})

describe('readBuiltInThemeVars', () => {
  it('reads the ground and accent that index.css defines for a theme', () => {
    expect(readBuiltInThemeVars('atreus-dark')).toEqual({ bg: '#12151f', accent: '#5468c4' })
  })

  it('returns null for a theme that has no rules', () => {
    expect(readBuiltInThemeVars('nonesuch-dark')).toBeNull()
  })

  it('leaves no trace: no leftover probe and no theme applied to <html>', () => {
    readBuiltInThemeVars('atreus-dark')
    expect(document.querySelector('[data-theme]')).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('loadSplashPalette', () => {
  it('resolves the stored theme from localStorage and index.css', () => {
    localStorage.setItem('vide:theme', 'atreus-dark')
    expect(loadSplashPalette()).toEqual({ bg: '#12151f', accent: '#5468c4', isLight: false })
  })

  it('resolves a light theme as light', () => {
    localStorage.setItem('vide:theme', 'claude-light')
    expect(loadSplashPalette().isLight).toBe(true)
  })

  it('follows the system variant when match-system is on', () => {
    localStorage.setItem('vide:theme', 'claude-light')
    localStorage.setItem('vide:themeMatchSystem', 'true')
    expect(loadSplashPalette().bg).toBe('#1a1a1a') // matchMedia stub reports dark
  })
})
