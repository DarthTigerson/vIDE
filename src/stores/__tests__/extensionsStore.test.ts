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
      enabled: { 'image-viewer': true, 'svg-viewer': true },
      svgDefaultMode: 'toggle',
      svgModes: {},
    })
  })

  it('has both extensions enabled by default', () => {
    expect(useExtensionsStore.getState().isEnabled('image-viewer')).toBe(true)
    expect(useExtensionsStore.getState().isEnabled('svg-viewer')).toBe(true)
  })

  it('setEnabled updates state, persists under a vide: key and notifies sync', () => {
    useExtensionsStore.getState().setEnabled('svg-viewer', false)
    expect(useExtensionsStore.getState().isEnabled('svg-viewer')).toBe(false)
    expect(useExtensionsStore.getState().isEnabled('image-viewer')).toBe(true)
    expect(localStorageStore['vide:general:extension:svg-viewer:enabled']).toBe('false')
    expect(notifySettingChanged).toHaveBeenCalled()
  })

  it('persists the SVG default mode and notifies sync', () => {
    useExtensionsStore.getState().setSvgDefaultMode('split')
    expect(useExtensionsStore.getState().svgDefaultMode).toBe('split')
    expect(localStorageStore['vide:general:svgDefaultMode']).toBe('split')
    expect(notifySettingChanged).toHaveBeenCalled()
  })

  it('reads saved state back when the store is loaded', async () => {
    localStorageStore['vide:general:extension:image-viewer:enabled'] = 'false'
    localStorageStore['vide:general:svgDefaultMode'] = 'preview'
    vi.resetModules()
    const { useExtensionsStore: fresh } = await import('../extensionsStore')
    expect(fresh.getState().isEnabled('image-viewer')).toBe(false)
    expect(fresh.getState().svgDefaultMode).toBe('preview')
  })

  it('ignores an unknown saved mode', async () => {
    localStorageStore['vide:general:svgDefaultMode'] = 'bogus'
    vi.resetModules()
    const { useExtensionsStore: fresh } = await import('../extensionsStore')
    expect(fresh.getState().svgDefaultMode).toBe('toggle')
  })

  it('keeps a per-file SVG mode that falls back to the default', () => {
    const store = useExtensionsStore.getState()
    expect(store.svgModeFor('/a.svg')).toBe('toggle')
    store.setSvgMode('/a.svg', 'split')
    expect(useExtensionsStore.getState().svgModeFor('/a.svg')).toBe('split')
    expect(useExtensionsStore.getState().svgModeFor('/b.svg')).toBe('toggle')
  })
})
