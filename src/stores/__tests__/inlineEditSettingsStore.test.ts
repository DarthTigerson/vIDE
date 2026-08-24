import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

import { useInlineEditSettingsStore } from '../inlineEditSettingsStore'

describe('inlineEditSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    useInlineEditSettingsStore.setState({ enabled: true, model: 'claude-sonnet-5' })
  })

  it('defaults to enabled with Sonnet 5 as the model', () => {
    expect(useInlineEditSettingsStore.getState().enabled).toBe(true)
    expect(useInlineEditSettingsStore.getState().model).toBe('claude-sonnet-5')
  })

  it('setEnabled persists to localStorage', () => {
    useInlineEditSettingsStore.getState().setEnabled(false)
    expect(useInlineEditSettingsStore.getState().enabled).toBe(false)
    expect(store['vide:inlineEdit:enabled']).toBe('false')
  })

  it('setModel persists to localStorage', () => {
    useInlineEditSettingsStore.getState().setModel('claude-opus-5')
    expect(useInlineEditSettingsStore.getState().model).toBe('claude-opus-5')
    expect(store['vide:inlineEdit:model']).toBe('claude-opus-5')
  })
})
