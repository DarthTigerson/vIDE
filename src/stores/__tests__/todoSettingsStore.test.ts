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

import { useTodoSettingsStore } from '../todoSettingsStore'

describe('todoSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useTodoSettingsStore.setState({ enabled: true })
  })

  it('defaults enabled to true', () => {
    expect(useTodoSettingsStore.getState().enabled).toBe(true)
  })

  it('setEnabled updates state and persists to localStorage', () => {
    useTodoSettingsStore.getState().setEnabled(false)
    expect(useTodoSettingsStore.getState().enabled).toBe(false)
    expect(localStorageStore['vide:todo:enabled']).toBe('false')
  })
})
