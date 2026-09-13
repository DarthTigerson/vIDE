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

describe('llamaSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    vi.resetModules()
  })

  it('defaults enabled to true', async () => {
    const { useLlamaSettingsStore } = await import('../llamaSettingsStore')
    expect(useLlamaSettingsStore.getState().enabled).toBe(true)
  })

  it('setEnabled updates state and persists to localStorage', async () => {
    const { useLlamaSettingsStore } = await import('../llamaSettingsStore')
    useLlamaSettingsStore.getState().setEnabled(false)
    expect(useLlamaSettingsStore.getState().enabled).toBe(false)
    expect(localStorageStore['vide:llama:enabled']).toBe('false')
  })

  it('persists enabled across store reloads', async () => {
    const { useLlamaSettingsStore } = await import('../llamaSettingsStore')
    useLlamaSettingsStore.getState().setEnabled(false)

    vi.resetModules()
    const { useLlamaSettingsStore: reloaded } = await import('../llamaSettingsStore')
    expect(reloaded.getState().enabled).toBe(false)
  })
})
