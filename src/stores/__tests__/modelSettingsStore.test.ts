import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useModelSettingsStore } from '../modelSettingsStore'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
    clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]) },
  }
  return { localStorageStore }
})

describe('modelSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useModelSettingsStore.setState({ enabled: { claude: true, bridge: true } })
  })

  it('defaults to only claude enabled on first launch (no stored preference)', async () => {
    vi.resetModules()
    const { useModelSettingsStore: freshStore } = await import('../modelSettingsStore')
    expect(freshStore.getState().enabled).toEqual({ claude: true, bridge: false })
  })

  it('drops stale keys not in the current model set and forces claude on if none survive', async () => {
    localStorageStore['vide:enabledModels'] = JSON.stringify({ claude: false, codex: true, bridge: false })
    vi.resetModules()
    const { useModelSettingsStore: freshStore } = await import('../modelSettingsStore')
    const enabled = freshStore.getState().enabled
    expect(enabled).not.toHaveProperty('codex')
    expect(enabled.claude).toBe(true)
  })

  it('disables a model', () => {
    useModelSettingsStore.getState().setEnabled('bridge', false)
    expect(useModelSettingsStore.getState().enabled.bridge).toBe(false)
  })

  it('re-enables a model', () => {
    useModelSettingsStore.getState().setEnabled('bridge', false)
    useModelSettingsStore.getState().setEnabled('bridge', true)
    expect(useModelSettingsStore.getState().enabled.bridge).toBe(true)
  })

  it('refuses to disable the last remaining enabled model', () => {
    useModelSettingsStore.getState().setEnabled('bridge', false)
    // Only 'claude' left enabled — disabling it would leave nothing selectable.
    useModelSettingsStore.getState().setEnabled('claude', false)
    expect(useModelSettingsStore.getState().enabled.claude).toBe(true)
  })

  it('persists changes to localStorage', () => {
    useModelSettingsStore.getState().setEnabled('bridge', false)
    expect(JSON.parse(localStorage.getItem('vide:enabledModels')!)).toMatchObject({ bridge: false })
  })
})
