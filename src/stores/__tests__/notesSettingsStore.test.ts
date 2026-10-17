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
    useNotesSettingsStore.setState({ enabled: true, sort: 'alphabetical', order: {} })
  })

  it('defaults enabled to true', () => {
    expect(useNotesSettingsStore.getState().enabled).toBe(true)
  })

  it('setEnabled updates state and persists to localStorage', () => {
    useNotesSettingsStore.getState().setEnabled(false)
    expect(useNotesSettingsStore.getState().enabled).toBe(false)
    expect(localStorageStore['vide:notes:enabled']).toBe('false')
  })

  it('defaults to Alphabetical and persists the chosen sort', () => {
    expect(useNotesSettingsStore.getState().sort).toBe('alphabetical')
    useNotesSettingsStore.getState().setSort('updated')
    expect(useNotesSettingsStore.getState().sort).toBe('updated')
    expect(localStorageStore['vide:notes:sort']).toBe('updated')
  })

  it('persists a folder\'s manual order and keeps it through a rename', () => {
    useNotesSettingsStore.getState().setFolderOrder('Work', ['b.md', 'a.md'])
    useNotesSettingsStore.getState().renameInOrder('Work', 'Jobs')
    expect(useNotesSettingsStore.getState().order).toEqual({ Jobs: ['b.md', 'a.md'] })
    expect(JSON.parse(localStorageStore['vide:notes:order'])).toEqual({ Jobs: ['b.md', 'a.md'] })
  })
})
