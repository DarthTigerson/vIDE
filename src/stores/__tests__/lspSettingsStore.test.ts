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

import { LSP_SERVER_IDS, useLspSettingsStore } from '../lspSettingsStore'

describe('lspSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    vi.clearAllMocks()
    useLspSettingsStore.setState({
      enabled: Object.fromEntries(LSP_SERVER_IDS.map((id) => [id, false])) as Record<string, boolean> as any,
    })
  })

  it('defaults every language server to disabled', () => {
    const { enabled } = useLspSettingsStore.getState()
    for (const id of LSP_SERVER_IDS) expect(enabled[id]).toBe(false)
  })

  it('setEnabled updates state, persists to localStorage, and notifies the main process', () => {
    useLspSettingsStore.getState().setEnabled('go', true)

    expect(useLspSettingsStore.getState().enabled.go).toBe(true)
    expect(store['vide:lsp:enabled:go']).toBe('true')
    expect(apiMock.lspSetEnabled).toHaveBeenCalledWith('go', true)
  })

  it('does not affect other languages when one is toggled', () => {
    useLspSettingsStore.getState().setEnabled('rust', true)

    const { enabled } = useLspSettingsStore.getState()
    expect(enabled.rust).toBe(true)
    expect(enabled.go).toBe(false)
    expect(enabled.python).toBe(false)
    expect(enabled.typescript).toBe(false)
  })
})
