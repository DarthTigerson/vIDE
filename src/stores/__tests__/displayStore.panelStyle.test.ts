import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  ;(global as any).document = {
    documentElement: {
      style: { setProperty: () => {} },
      setAttribute: () => {},
    },
  }
  return { localStorageStore }
})

import { PANEL_STYLE_OPTIONS } from '../displayStore'

beforeEach(() => {
  Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
})

describe('PANEL_STYLE_OPTIONS', () => {
  it('lists Brush Metal first, then Solid, Glossy, Glass, with the requested labels and descriptions', () => {
    expect(PANEL_STYLE_OPTIONS).toEqual([
      { value: 'brushed-metal', label: 'Brush Metal', description: 'Welder approved' },
      { value: 'solid', label: 'Solid', description: 'Solid panels' },
      { value: 'glossy', label: 'Glossy', description: 'Frosted glass' },
      { value: 'glass', label: 'Glass', description: 'See-through' },
    ])
  })

  it('no longer offers Matt', () => {
    expect(PANEL_STYLE_OPTIONS.some((o) => (o.value as string) === 'matt')).toBe(false)
  })
})

describe('displayStore panelStyle initial value', () => {
  it('defaults to solid when nothing is stored', async () => {
    vi.resetModules()
    const mod = await import('../displayStore')
    expect(mod.useDisplayStore.getState().panelStyle).toBe('solid')
  })

  it('falls back to solid for a legacy/invalid stored value (e.g. the removed "matt")', async () => {
    localStorageStore['vide:panelStyle'] = 'matt'
    vi.resetModules()
    const mod = await import('../displayStore')
    expect(mod.useDisplayStore.getState().panelStyle).toBe('solid')
  })

  it('honors a valid stored value', async () => {
    localStorageStore['vide:panelStyle'] = 'glass'
    vi.resetModules()
    const mod = await import('../displayStore')
    expect(mod.useDisplayStore.getState().panelStyle).toBe('glass')
  })
})
