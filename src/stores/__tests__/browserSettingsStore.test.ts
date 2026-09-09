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

import { useBrowserSettingsStore } from '../browserSettingsStore'

describe('browserSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useBrowserSettingsStore.setState({ openInBiggestPane: true, closeSidePanelOnOpen: false })
  })

  it('closeSidePanelOnOpen defaults to false', () => {
    expect(useBrowserSettingsStore.getState().closeSidePanelOnOpen).toBe(false)
  })

  it('setCloseSidePanelOnOpen updates state and persists to localStorage', () => {
    useBrowserSettingsStore.getState().setCloseSidePanelOnOpen(true)
    expect(useBrowserSettingsStore.getState().closeSidePanelOnOpen).toBe(true)
    expect(localStorageStore['vide:browser:closeSidePanel']).toBe('true')
  })
})
