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

import { useDisplayStore } from '../displayStore'

describe('displayStore — footer content + memory usage visibility', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  })

  it('defaults footerContent to hints', () => {
    expect(useDisplayStore.getState().footerContent).toBe('hints')
  })

  it('setFooterContent updates state and persists to localStorage', () => {
    useDisplayStore.getState().setFooterContent('clock')
    expect(useDisplayStore.getState().footerContent).toBe('clock')
    expect(localStorageStore['vide:footerContent']).toBe('clock')
  })

  it('defaults memoryUsageVisible to true', () => {
    expect(useDisplayStore.getState().memoryUsageVisible).toBe(true)
  })

  it('setMemoryUsageVisible updates state and persists to localStorage', () => {
    useDisplayStore.getState().setMemoryUsageVisible(false)
    expect(useDisplayStore.getState().memoryUsageVisible).toBe(false)
    expect(localStorageStore['vide:memoryUsageVisible']).toBe('false')
  })
})
