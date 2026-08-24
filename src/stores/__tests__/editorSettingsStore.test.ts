import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

import { useEditorSettingsStore } from '../editorSettingsStore'

describe('editorSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    useEditorSettingsStore.setState({
      autoSaveEnabled: false,
      wordWrapEnabled: false,
      changeAllOccurrencesInMenu: false,
    })
  })

  it('has correct defaults', () => {
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(false)
    expect(useEditorSettingsStore.getState().wordWrapEnabled).toBe(false)
    expect(useEditorSettingsStore.getState().changeAllOccurrencesInMenu).toBe(false)
  })

  it('setChangeAllOccurrencesInMenu persists to localStorage', () => {
    useEditorSettingsStore.getState().setChangeAllOccurrencesInMenu(true)
    expect(useEditorSettingsStore.getState().changeAllOccurrencesInMenu).toBe(true)
    expect(store['vide:editor:changeAllOccurrencesInMenu']).toBe('true')
  })

  it('setAutoSaveEnabled persists to localStorage', () => {
    useEditorSettingsStore.getState().setAutoSaveEnabled(true)
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(true)
    expect(store['vide:editor:autoSaveEnabled']).toBe('true')
  })

  it('toggleWordWrap flips the value and persists it', () => {
    useEditorSettingsStore.getState().toggleWordWrap()
    expect(useEditorSettingsStore.getState().wordWrapEnabled).toBe(true)
    expect(store['vide:editor:wordWrapEnabled']).toBe('true')

    useEditorSettingsStore.getState().toggleWordWrap()
    expect(useEditorSettingsStore.getState().wordWrapEnabled).toBe(false)
    expect(store['vide:editor:wordWrapEnabled']).toBe('false')
  })
})
