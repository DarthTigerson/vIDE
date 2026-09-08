import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore, mediaState } = vi.hoisted(() => {
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
    documentElement: {
      style: { setProperty: () => {} },
      setAttribute: () => {},
    },
  }

  return { localStorageStore, mediaState }
})

import { useThemeStore } from '../themeStore'
import { useDisplayStore } from '../displayStore'

beforeEach(() => {
  Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  mediaState.matches = false
  useThemeStore.setState({ theme: 'link-dark', matchSystem: false })
  useDisplayStore.setState({ backgroundImage: 'none' })
})

describe('background image follows the active theme family', () => {
  it('switches to clawd when the family becomes claude', () => {
    useThemeStore.getState().setFamily('claude')
    expect(useDisplayStore.getState().backgroundImage).toBe('clawd')
  })

  it('switches to vide for the thomas (vIDE) family', () => {
    useThemeStore.getState().setFamily('thomas')
    expect(useDisplayStore.getState().backgroundImage).toBe('vide')
  })

  it('switches to link for the link family', () => {
    useThemeStore.setState({ theme: 'claude-dark' })
    useThemeStore.getState().setFamily('link')
    expect(useDisplayStore.getState().backgroundImage).toBe('link')
  })

  it('switches to atreus for the atreus family', () => {
    useThemeStore.getState().setFamily('atreus')
    expect(useDisplayStore.getState().backgroundImage).toBe('atreus')
  })

  it('clears to none for the luuk family', () => {
    useDisplayStore.setState({ backgroundImage: 'vide' })
    useThemeStore.getState().setFamily('luuk')
    expect(useDisplayStore.getState().backgroundImage).toBe('none')
  })

  it('does not touch the background when only the light/dark variant changes within the same family', () => {
    useThemeStore.getState().setFamily('atreus')
    useDisplayStore.getState().setBackgroundImage('none')
    useThemeStore.getState().setVariant(false)
    expect(useThemeStore.getState().theme).toBe('atreus-light')
    expect(useDisplayStore.getState().backgroundImage).toBe('none')
  })

  it('does not touch the background when only "match system appearance" toggles within the same family', () => {
    useThemeStore.getState().setFamily('atreus')
    useDisplayStore.getState().setBackgroundImage('none')
    useThemeStore.getState().setMatchSystem(true)
    expect(useDisplayStore.getState().backgroundImage).toBe('none')
  })
})
