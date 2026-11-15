// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppInfo } from '../../../electron/apps/appTypes'
import { useFileStore } from '@/stores/fileStore'
import { useAppContribStore } from '../appContribStore'
import { startAppRuntime, resetAppRuntimeForTests } from '../appRuntime'

const app = (id: string, over: Partial<AppInfo> = {}): AppInfo => ({
  id, name: id, version: '1.0.0', source: 'store', rendererUrl: `vide-app://${id}/renderer.js`,
  hasMain: false, contributes: {} as AppInfo['contributes'], status: 'loaded', ...over,
})

let list: AppInfo[]
let changed: () => void
const api = () => ({
  appsList: vi.fn(async () => list),
  onAppsChanged: vi.fn((cb: () => void) => { changed = cb; return () => {} }),
}) as unknown as Window['api']

beforeEach(() => {
  resetAppRuntimeForTests()
  useAppContribStore.setState({
    apps: [], runtimeErrors: {}, panels: {}, settingsPages: {}, tabKinds: {},
    commands: [], notifications: [], panelRequest: null,
  })
})

describe('startAppRuntime', () => {
  it('imports loaded apps and calls activate; skips failed / restart-required', async () => {
    list = [app('a'), app('b', { status: 'failed' }), app('c', { status: 'restart-required' })]
    const activate = vi.fn()
    const importFn = vi.fn(async () => ({ activate }))
    await startAppRuntime({ api: api(), importFn })
    expect(importFn).toHaveBeenCalledTimes(1)
    expect(importFn).toHaveBeenCalledWith('vide-app://a/renderer.js?v=1.0.0')
    expect(activate).toHaveBeenCalledTimes(1)
    expect((globalThis as { __videShared?: unknown }).__videShared).toBeDefined()
  })

  it('a rejecting import or throwing activate sets runtimeErrors, others still activate', async () => {
    list = [app('a'), app('b'), app('c')]
    const ok = vi.fn()
    const importFn = vi.fn(async (url: string) => {
      if (url.includes('//a/')) throw new Error('bad import')
      if (url.includes('//b/')) return { activate: () => { throw new Error('bad activate') } }
      return { activate: ok }
    })
    await startAppRuntime({ api: api(), importFn })
    const s = useAppContribStore.getState()
    expect(s.runtimeErrors.a).toBe('bad import')
    expect(s.runtimeErrors.b).toBe('bad activate')
    expect(s.runtimeErrors.c).toBeUndefined()
    expect(ok).toHaveBeenCalled()
  })

  it('only starts once', async () => {
    list = [app('a')]
    const importFn = vi.fn(async () => ({ activate: vi.fn() }))
    const a = api()
    const p1 = startAppRuntime({ api: a, importFn })
    const p2 = startAppRuntime({ api: a, importFn })
    expect(p1).toBe(p2)
    await p1
    expect(importFn).toHaveBeenCalledTimes(1)
  })

  it('uninstalled app is deactivated and cleared; updated app re-imports with new ?v=', async () => {
    list = [app('a'), app('b')]
    const deactivate = vi.fn()
    const importFn = vi.fn(async () => ({ activate: vi.fn(), deactivate }))
    await startAppRuntime({ api: api(), importFn })
    useAppContribStore.getState().registerNotification({ appId: 'a', id: 'n', text: 't' })

    list = [app('b', { version: '2.0.0' })]
    changed()
    await vi.waitFor(() => expect(importFn).toHaveBeenCalledTimes(3))
    expect(importFn).toHaveBeenLastCalledWith('vide-app://b/renderer.js?v=2.0.0')
    expect(deactivate).toHaveBeenCalledTimes(2)
    expect(useAppContribStore.getState().notifications).toEqual([])
  })

  it('re-imports when only the renderer URL changes (dev reload)', async () => {
    list = [app('d', { source: 'dev', rendererUrl: 'vide-app://d/renderer.js?v=1.0.0-1' })]
    const deactivate = vi.fn()
    const importFn = vi.fn(async () => ({ activate: vi.fn(), deactivate }))
    await startAppRuntime({ api: api(), importFn })
    list = [app('d', { source: 'dev', rendererUrl: 'vide-app://d/renderer.js?v=1.0.0-2' })]
    changed()
    await vi.waitFor(() => expect(importFn).toHaveBeenCalledTimes(2))
    expect(importFn).toHaveBeenLastCalledWith('vide-app://d/renderer.js?v=1.0.0-2')
    expect(deactivate).toHaveBeenCalledTimes(1)
  })

  it('adds the app stylesheet while active and removes it on uninstall', async () => {
    list = [app('s', { styleUrl: 'vide-app://s/style.css?v=1.0.0' })]
    const importFn = vi.fn(async () => ({ activate: vi.fn() }))
    await startAppRuntime({ api: api(), importFn })
    const links = () => document.head.querySelectorAll('link[data-vide-app="s"]')
    expect(links()).toHaveLength(1)
    expect((links()[0] as HTMLLinkElement).href).toBe('vide-app://s/style.css?v=1.0.0')
    list = []
    changed()
    await vi.waitFor(() => expect(links()).toHaveLength(0))
  })

  it('restart-required keeps an already loaded app and never newly imports one', async () => {
    list = [app('a')]
    const deactivate = vi.fn()
    const importFn = vi.fn(async () => ({ activate: vi.fn(), deactivate }))
    await startAppRuntime({ api: api(), importFn })
    list = [app('a', { status: 'restart-required', version: '2.0.0' }), app('n', { status: 'restart-required' })]
    changed()
    await new Promise((r) => setTimeout(r, 20))
    expect(deactivate).not.toHaveBeenCalled()
    expect(importFn).toHaveBeenCalledTimes(1)
  })

  it('a never-settling activate times out and later apps still load', async () => {
    list = [app('a'), app('b')]
    const ok = vi.fn()
    const importFn = vi.fn(async (url: string) =>
      url.includes('//a/') ? { activate: () => new Promise<void>(() => {}) } : { activate: ok })
    await startAppRuntime({ api: api(), importFn, activateTimeoutMs: 20 })
    expect(useAppContribStore.getState().runtimeErrors.a).toBe('activate did not finish within 10s')
    expect(ok).toHaveBeenCalled()
  })

  it('teardown and update remove the old version listeners', async () => {
    list = [app('a')]
    const calls: string[] = []
    let n = 0
    const importFn = vi.fn(async () => {
      const tag = `v${++n}`
      return { activate: (v: import('../videApiTypes').VideRendererApi) => { v.project.subscribe(() => calls.push(tag)) } }
    })
    await startAppRuntime({ api: api(), importFn })
    list = [app('a', { version: '2.0.0' })]
    changed()
    await vi.waitFor(() => expect(importFn).toHaveBeenCalledTimes(2))
    useFileStore.setState({ projectRoot: '/changed-by-test' })
    expect(calls).toEqual(['v2'])
    list = []
    changed()
    await vi.waitFor(() => expect(useAppContribStore.getState().apps).toEqual([]))
    useFileStore.setState({ projectRoot: '/again' })
    expect(calls).toEqual(['v2'])
  })
})
