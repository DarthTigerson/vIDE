import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStoreStore, findStoreApp, appAction, subscribeStoreChanged } from '../storeStore'
import { STORE_TAB_PATH, buildStoreAppPath, isStoreTab, storeAppIdFromPath } from '@/components/Settings/paths'
import { isReadOnlyTab } from '@/lib/tabKinds'
import type { RegistryState } from '@/types/api'

const okState: RegistryState = {
  status: 'ok',
  checkedAt: 1,
  fromCache: false,
  apps: [{
    id: 'docker', name: 'Docker', description: 'd', repo: 'o/r', firstParty: true, compatible: true, recommended: false, category: 'applications', targets: ['vide'],
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

describe('appAction', () => {
  const listing = (version: string, compatible = true) => ({ ...okState.status === 'ok' ? okState.apps[0] : ({} as any), compatible, latest: { ...(okState as any).apps[0].latest, version } })
  const inst = (version: string, extra: any = {}) => ({ id: 'docker', name: 'Docker', version, source: 'store', status: 'loaded', contributes: {}, hasMain: false, rendererUrl: '', ...extra })
  it('covers every outcome', () => {
    expect(appAction(listing('1.0.0'), undefined)).toBe('install')
    expect(appAction(listing('1.0.0', false), undefined)).toBe('needs-vide')
    expect(appAction(listing('1.1.0'), inst('1.0.0'))).toBe('update')
    expect(appAction(listing('1.1.0', false), inst('1.0.0'))).toBe('open')
    expect(appAction(listing('1.0.0'), inst('1.0.0'))).toBe('open')
    expect(appAction(undefined, inst('1.0.0'))).toBe('open')
    expect(appAction(listing('1.1.0'), inst('1.0.0', { status: 'restart-required' }))).toBe('restart')
    expect(appAction(listing('1.1.0'), inst('1.0.0', { status: 'failed' }))).toBe('failed')
    expect(appAction(listing('1.0.0'), inst('1.0.0', { source: 'dev' }))).toBe('install')
  })
})

describe('install / uninstall', () => {
  it('ignores a second install while one is in flight', async () => {
    const appsInstall = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).window.api.appsInstall = appsInstall
    useStoreStore.setState({ busy: {}, errors: {} })
    await Promise.all([useStoreStore.getState().install('docker'), useStoreStore.getState().install('docker')])
    expect(appsInstall).toHaveBeenCalledTimes(1)
  })
  it('tracks busy, clears it, and records errors', async () => {
    const appsInstall = vi.fn().mockResolvedValue({ ok: false, error: 'bad sha' })
    ;(globalThis as any).window.api.appsInstall = appsInstall
    const p = useStoreStore.getState().install('docker')
    expect(useStoreStore.getState().busy.docker).toBe('installing')
    await p
    expect(useStoreStore.getState().busy.docker).toBeUndefined()
    expect(useStoreStore.getState().errors.docker).toBe('bad sha')
    appsInstall.mockResolvedValue({ ok: true })
    await useStoreStore.getState().install('docker')
    expect(useStoreStore.getState().errors.docker).toBeUndefined()
  })
  it('uninstalls via appsUninstall', async () => {
    const appsUninstall = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).window.api.appsUninstall = appsUninstall
    await useStoreStore.getState().uninstall('docker')
    expect(appsUninstall).toHaveBeenCalledWith('docker')
  })
})

describe('dismissed updates and store:changed', () => {
  it('persists dismissals in localStorage', () => {
    const store: Record<string, string> = {}
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    ;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    useStoreStore.getState().dismissUpdate('store-update-docker-1.1.0')
    expect(JSON.parse(store['vide:store:dismissedUpdates'])).toEqual(['store-update-docker-1.1.0'])
    expect(useStoreStore.getState().dismissedUpdates).toContain('store-update-docker-1.1.0')
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete (globalThis as any).localStorage
  })
  it('prunes dismissed ids the catalog no longer offers', () => {
    const store: Record<string, string> = {}
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    ;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    useStoreStore.setState({ registry: okState, dismissedUpdates: ['store-update-docker-0.9.0', 'store-update-gone-1.0.0'] })
    useStoreStore.getState().dismissUpdate('store-update-docker-1.0.0')
    expect(useStoreStore.getState().dismissedUpdates).toEqual(['store-update-docker-1.0.0'])
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete (globalThis as any).localStorage
  })
  it('subscribeStoreChanged reloads without refresh', () => {
    let cb: () => void = () => {}
    ;(globalThis as any).window.api.onStoreChanged = (f: () => void) => { cb = f; return () => {} }
    storeGetRegistry.mockResolvedValue(okState)
    subscribeStoreChanged()
    cb()
    expect(storeGetRegistry).toHaveBeenCalledWith(false)
  })
})
