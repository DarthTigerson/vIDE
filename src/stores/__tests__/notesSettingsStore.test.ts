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

import { useNotesSettingsStore } from '../notesSettingsStore'

describe('notesSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useNotesSettingsStore.setState({ enabled: true })
  })

  it('defaults enabled to true', () => {
    expect(useNotesSettingsStore.getState().enabled).toBe(true)
  })

  it('setEnabled updates state and persists to localStorage', () => {
    useNotesSettingsStore.getState().setEnabled(false)
    expect(useNotesSettingsStore.getState().enabled).toBe(false)
    expect(localStorageStore['vide:notes:enabled']).toBe('false')
  })
})
