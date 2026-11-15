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

import { useGitRemoteSettingsStore } from '../gitRemoteSettingsStore'

describe('gitRemoteSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useGitRemoteSettingsStore.setState({ closeSidePanelOnOpen: false })
  })

  it('defaults closeSidePanelOnOpen to false', () => {
    expect(useGitRemoteSettingsStore.getState().closeSidePanelOnOpen).toBe(false)
  })

  it('setCloseSidePanelOnOpen updates state and persists to localStorage', () => {
    useGitRemoteSettingsStore.getState().setCloseSidePanelOnOpen(true)
    expect(useGitRemoteSettingsStore.getState().closeSidePanelOnOpen).toBe(true)
    expect(localStorageStore['vide:gitRemote:closeSidePanel']).toBe('true')
  })
})
