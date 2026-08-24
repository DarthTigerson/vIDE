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

import { useDockerSettingsStore } from '../dockerSettingsStore'

describe('dockerSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useDockerSettingsStore.setState({ enabled: false })
  })

  it('defaults enabled to false', () => {
    expect(useDockerSettingsStore.getState().enabled).toBe(false)
  })

  it('setEnabled updates state and persists to localStorage', () => {
    useDockerSettingsStore.getState().setEnabled(true)
    expect(useDockerSettingsStore.getState().enabled).toBe(true)
    expect(localStorageStore['vide:docker:enabled']).toBe('true')
  })
})
