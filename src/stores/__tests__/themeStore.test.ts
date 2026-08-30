import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore, mediaState } = vi.hoisted(() => {
  // themeStore.ts reads window.matchMedia and writes document.documentElement
  // at module load time (module-scope `systemDarkQuery` + the initial
  // applyTheme() call), so both stubs must exist before the static import
  // below runs — plain node env has neither by default.
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }

  const mediaState = { matches: false }
  ;(globalThis as any).window = {
    matchMedia: () => ({
      get matches() { return mediaState.matches },
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  }
  ;(globalThis as any).document = {
    documentElement: { setAttribute: () => {} },
  }

  return { localStorageStore, mediaState }
})

import { useThemeStore, familyOf } from '../themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    mediaState.matches = false
    useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
  })

  describe('familyOf', () => {
    it('strips the -dark/-light suffix', () => {
      expect(familyOf('thomas-light')).toBe('thomas')
      expect(familyOf('luuk-dark')).toBe('luuk')
    })
  })

  describe('setFamily', () => {
    it('switches family while preserving the current explicit variant', () => {
      useThemeStore.setState({ theme: 'claude-light', matchSystem: false })
      useThemeStore.getState().setFamily('thomas')
      expect(useThemeStore.getState().theme).toBe('thomas-light')
    })

    it('does not touch matchSystem — a family switch while following system stays following system', () => {
      mediaState.matches = true
      useThemeStore.setState({ theme: 'claude-dark', matchSystem: true })
      useThemeStore.getState().setFamily('link')
      expect(useThemeStore.getState().matchSystem).toBe(true)
      expect(useThemeStore.getState().theme).toBe('link-dark')
    })
  })

  describe('setVariant', () => {
    it('switches to dark, preserving family, and turns off matchSystem', () => {
      useThemeStore.setState({ theme: 'thomas-light', matchSystem: true })
      useThemeStore.getState().setVariant(true)
      expect(useThemeStore.getState().theme).toBe('thomas-dark')
      expect(useThemeStore.getState().matchSystem).toBe(false)
    })

    it('switches to light, preserving family', () => {
      useThemeStore.setState({ theme: 'luuk-dark', matchSystem: false })
      useThemeStore.getState().setVariant(false)
      expect(useThemeStore.getState().theme).toBe('luuk-light')
    })
  })
})
