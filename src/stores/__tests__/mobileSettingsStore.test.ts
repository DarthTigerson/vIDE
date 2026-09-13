import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

import { useMobileSettingsStore } from '../mobileSettingsStore'

describe('mobileSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useMobileSettingsStore.setState({ enabled: true, defaultMode: null })
  })

  it('defaults enabled to true', () => {
    expect(useMobileSettingsStore.getState().enabled).toBe(true)
  })

  it('setEnabled updates state and persists to localStorage', () => {
    useMobileSettingsStore.getState().setEnabled(false)
    expect(useMobileSettingsStore.getState().enabled).toBe(false)
    expect(localStorageStore['vide:mobile:enabled']).toBe('false')
  })

  it('defaults defaultMode to null', () => {
    expect(useMobileSettingsStore.getState().defaultMode).toBeNull()
  })

  it('setDefaultMode updates state and persists to localStorage', () => {
    useMobileSettingsStore.getState().setDefaultMode('vide')
    expect(useMobileSettingsStore.getState().defaultMode).toBe('vide')
    expect(localStorageStore['vide:mobile:defaultMode']).toBe('vide')

    useMobileSettingsStore.getState().setDefaultMode('graph')
    expect(useMobileSettingsStore.getState().defaultMode).toBe('graph')
    expect(localStorageStore['vide:mobile:defaultMode']).toBe('graph')
  })

  it('setDefaultMode(null) clears the stored preference', () => {
    useMobileSettingsStore.getState().setDefaultMode('vide')
    useMobileSettingsStore.getState().setDefaultMode(null)
    expect(useMobileSettingsStore.getState().defaultMode).toBeNull()
    expect(localStorageStore['vide:mobile:defaultMode']).toBeUndefined()
  })
})
