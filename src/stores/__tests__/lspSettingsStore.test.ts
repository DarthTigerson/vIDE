import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store, apiMock } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  const apiMock = { lspSetEnabled: vi.fn() }
  ;(global as any).window = { api: apiMock }
  return { store, apiMock }
})

import { isServerEnabled, useLspSettingsStore } from '../lspSettingsStore'

describe('lspSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    vi.clearAllMocks()
    useLspSettingsStore.setState({ enabled: {} })
  })

  it('an installed server is on until the user switches it off', () => {
    expect(isServerEnabled('go')).toBe(true)
    store['vide:lsp:enabled:go'] = 'false'
    expect(isServerEnabled('go')).toBe(false)
  })

  it('setEnabled updates state, persists to localStorage, and notifies the main process', () => {
    useLspSettingsStore.getState().setEnabled('go', false)

    expect(useLspSettingsStore.getState().enabled.go).toBe(false)
    expect(store['vide:lsp:enabled:go']).toBe('false')
    expect(apiMock.lspSetEnabled).toHaveBeenCalledWith('go', false)
  })

  it('does not affect other languages when one is toggled', () => {
    useLspSettingsStore.getState().setEnabled('rust', false)

    expect(isServerEnabled('rust')).toBe(false)
    expect(isServerEnabled('go')).toBe(true)
  })
})
