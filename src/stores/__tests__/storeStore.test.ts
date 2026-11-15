import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStoreStore, findStoreApp } from '../storeStore'
import { STORE_TAB_PATH, buildStoreAppPath, isStoreTab, storeAppIdFromPath } from '@/components/Settings/paths'
import { isReadOnlyTab } from '@/lib/tabKinds'
import type { RegistryState } from '@/types/api'

const okState: RegistryState = {
  status: 'ok',
  checkedAt: 1,
  fromCache: false,
  apps: [{
    id: 'docker', name: 'Docker', description: 'd', repo: 'o/r', firstParty: true, compatible: true,
    latest: { version: '1.0.0', commit: 'a'.repeat(40), url: 'https://x', sha256: 'b'.repeat(64), minVide: '0.4.0' },
  }],
}

const storeGetRegistry = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).window = { api: { storeGetRegistry } }
  useStoreStore.setState({ registry: null, loading: false })
})

describe('store tab paths', () => {
  it('round-trips an app id', () => {
    expect(storeAppIdFromPath(buildStoreAppPath('docker'))).toBe('docker')
    expect(storeAppIdFromPath(STORE_TAB_PATH)).toBeNull()
    expect(storeAppIdFromPath('store://app/')).toBeNull()
  })

  it('treats both store tabs as read-only store tabs', () => {
    for (const path of [STORE_TAB_PATH, buildStoreAppPath('docker')]) {
      expect(isStoreTab(path)).toBe(true)
      expect(isReadOnlyTab({ path, content: '', dirty: false } as any)).toBe(true)
    }
    expect(isStoreTab('/Users/x/store.ts')).toBe(false)
  })
})

describe('useStoreStore', () => {
  it('loads the registry and clears loading', async () => {
    storeGetRegistry.mockResolvedValue(okState)
    const promise = useStoreStore.getState().load(true)
    expect(useStoreStore.getState().loading).toBe(true)
    await promise
    expect(storeGetRegistry).toHaveBeenCalledWith(true)
    expect(useStoreStore.getState().registry).toEqual(okState)
    expect(useStoreStore.getState().loading).toBe(false)
  })

  it('shares one IPC call between concurrent loads', async () => {
    storeGetRegistry.mockResolvedValue(okState)
    await Promise.all([useStoreStore.getState().load(), useStoreStore.getState().load()])
    expect(storeGetRegistry).toHaveBeenCalledTimes(1)
  })

  it('turns an IPC failure into an error state', async () => {
    storeGetRegistry.mockRejectedValue(new Error('boom'))
    await useStoreStore.getState().load()
    expect(useStoreStore.getState().registry?.status).toBe('error')
  })

  it('finds an app by id only in an ok registry', () => {
    expect(findStoreApp(okState, 'docker')?.name).toBe('Docker')
    expect(findStoreApp(okState, 'nope')).toBeNull()
    expect(findStoreApp({ status: 'too-new' }, 'docker')).toBeNull()
  })
})
