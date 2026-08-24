import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

import { useCommitMessageSettingsStore } from '../commitMessageSettingsStore'

describe('commitMessageSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    useCommitMessageSettingsStore.setState({ enabled: true, model: 'claude-sonnet-5', prompt: '' })
  })

  it('defaults to enabled, Sonnet 5, and an empty (default) prompt', () => {
    expect(useCommitMessageSettingsStore.getState().enabled).toBe(true)
    expect(useCommitMessageSettingsStore.getState().model).toBe('claude-sonnet-5')
    expect(useCommitMessageSettingsStore.getState().prompt).toBe('')
  })

  it('setEnabled persists to localStorage', () => {
    useCommitMessageSettingsStore.getState().setEnabled(true)
    expect(useCommitMessageSettingsStore.getState().enabled).toBe(true)
    expect(store['vide:commitMessage:enabled']).toBe('true')
  })

  it('setModel persists to localStorage', () => {
    useCommitMessageSettingsStore.getState().setModel('claude-opus-5')
    expect(useCommitMessageSettingsStore.getState().model).toBe('claude-opus-5')
    expect(store['vide:commitMessage:model']).toBe('claude-opus-5')
  })

  it('setPrompt persists to localStorage', () => {
    useCommitMessageSettingsStore.getState().setPrompt('Always mention the ticket number')
    expect(useCommitMessageSettingsStore.getState().prompt).toBe('Always mention the ticket number')
    expect(store['vide:commitMessage:prompt']).toBe('Always mention the ticket number')
  })
})
