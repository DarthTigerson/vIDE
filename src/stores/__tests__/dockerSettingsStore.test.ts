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

describe('dockerSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    vi.resetModules()
  })

  it('defaults enabled to false, showBadge to true, badgeMode to containers', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    const state = useDockerSettingsStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.showBadge).toBe(true)
    expect(state.badgeMode).toBe('containers')
  })

  it('setEnabled updates state and persists to localStorage', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setEnabled(true)
    expect(useDockerSettingsStore.getState().enabled).toBe(true)
    expect(localStorageStore['vide:docker:enabled']).toBe('true')
  })

  it('setShowBadge updates state and persists to localStorage', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setShowBadge(false)
    expect(useDockerSettingsStore.getState().showBadge).toBe(false)
    expect(localStorageStore['vide:docker:showBadge']).toBe('false')
  })

  it('setBadgeMode updates state and persists to localStorage', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setBadgeMode('projects')
    expect(useDockerSettingsStore.getState().badgeMode).toBe('projects')
    expect(localStorageStore['vide:docker:badgeMode']).toBe('projects')
  })

  it('persists showBadge and badgeMode across store reloads', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setShowBadge(false)
    useDockerSettingsStore.getState().setBadgeMode('projects')

    vi.resetModules()
    const { useDockerSettingsStore: reloaded } = await import('../dockerSettingsStore')
    const state = reloaded.getState()
    expect(state.showBadge).toBe(false)
    expect(state.badgeMode).toBe('projects')
  })

  it('ignores a corrupted badgeMode value in localStorage and falls back to containers', async () => {
    localStorageStore['vide:docker:badgeMode'] = 'something-unexpected'
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    expect(useDockerSettingsStore.getState().badgeMode).toBe('containers')
  })
})
