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

  it('defaults enabled to false, showBadge to true, badgeMode to containers, showMemory to false, memoryFormat to usedPercent', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    const state = useDockerSettingsStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.showBadge).toBe(true)
    expect(state.badgeMode).toBe('containers')
    expect(state.showMemory).toBe(false)
    expect(state.memoryFormat).toBe('usedPercent')
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

  it('setShowMemory updates state and persists to localStorage', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setShowMemory(true)
    expect(useDockerSettingsStore.getState().showMemory).toBe(true)
    expect(localStorageStore['vide:docker:showMemory']).toBe('true')
  })

  it('setMemoryFormat updates state and persists to localStorage', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setMemoryFormat('usedOverLimit')
    expect(useDockerSettingsStore.getState().memoryFormat).toBe('usedOverLimit')
    expect(localStorageStore['vide:docker:memoryFormat']).toBe('usedOverLimit')
  })

  it('persists showMemory and memoryFormat across store reloads', async () => {
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    useDockerSettingsStore.getState().setShowMemory(true)
    useDockerSettingsStore.getState().setMemoryFormat('availablePercent')

    vi.resetModules()
    const { useDockerSettingsStore: reloaded } = await import('../dockerSettingsStore')
    const state = reloaded.getState()
    expect(state.showMemory).toBe(true)
    expect(state.memoryFormat).toBe('availablePercent')
  })

  it('ignores a corrupted memoryFormat value in localStorage and falls back to usedPercent', async () => {
    localStorageStore['vide:docker:memoryFormat'] = 'something-unexpected'
    const { useDockerSettingsStore } = await import('../dockerSettingsStore')
    expect(useDockerSettingsStore.getState().memoryFormat).toBe('usedPercent')
  })
})
