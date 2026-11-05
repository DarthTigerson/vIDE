import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore, notifySettingChanged } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore, notifySettingChanged: vi.fn() }
})

vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged }))

import { useExtensionsStore } from '../extensionsStore'

describe('extensionsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    notifySettingChanged.mockClear()
    useExtensionsStore.setState({
      enabled: { 'image-viewer': true },
    })
  })

  it('has the Image viewer enabled by default', () => {
    expect(useExtensionsStore.getState().isEnabled('image-viewer')).toBe(true)
  })

  it('setEnabled updates state, persists under a vide: key and notifies sync', () => {
    useExtensionsStore.getState().setEnabled('image-viewer', false)
    expect(useExtensionsStore.getState().isEnabled('image-viewer')).toBe(false)
    expect(localStorageStore['vide:general:extension:image-viewer:enabled']).toBe('false')
    expect(notifySettingChanged).toHaveBeenCalled()
  })

  it('reads saved state back when the store is loaded', async () => {
    localStorageStore['vide:general:extension:image-viewer:enabled'] = 'false'
    vi.resetModules()
    const { useExtensionsStore: fresh } = await import('../extensionsStore')
    expect(fresh.getState().isEnabled('image-viewer')).toBe(false)
  })
})
