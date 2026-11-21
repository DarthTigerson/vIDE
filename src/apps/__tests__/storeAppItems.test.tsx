import { describe, it, expect, vi } from 'vitest'
import { buildStoreAppEntries, buildStoreDisabledEntries, isUsageViewApp, buildStoreAppBarItems, storeAppPanelLeavesOnProjectClose, panelForRequest, storeEntriesHaveBadge } from '../storeAppItems'
import type { AppInfo } from '../../../electron/apps/appTypes'
import type { RegistryState } from '@/types/api'

const app = (over: Partial<AppInfo>): AppInfo => ({
  id: 'hello', name: 'Hello', version: '1.0.0', source: 'store', rendererUrl: '', hasMain: false,
  contributes: {} as AppInfo['contributes'], status: 'loaded', ...over,
})
const base = { runtimeErrors: {}, panels: {}, settingsPages: {}, projectOpen: true, openPanel: () => {}, openSettings: () => {}, uninstall: async () => ({ ok: true as const }) }

describe('buildStoreAppEntries', () => {
  it('lists a loaded app with uninstall; favoritable only with a panel', () => {
    const [e] = buildStoreAppEntries({ ...base, apps: [app({})] })
    expect(e.id).toBe('app:hello')
    expect(e.favoritable).toBe(false)
    expect(e.onUninstall).toBeTypeOf('function')
    const panels = { hello: { appId: 'hello', title: 'Hello', icon: () => null, component: () => null, requiresProject: false } }
    expect(buildStoreAppEntries({ ...base, apps: [app({})], panels })[0]).toMatchObject({ favoritable: true, favorite: false })
    expect(buildStoreAppEntries({ ...base, apps: [app({})], panels, favorites: ['app:hello'] })[0].favorite).toBe(true)
  })
  it('never lists a usage view, even with a panel, failed or disabled', () => {
    const isUsageView = (id: string) => id === 'hello'
    expect(buildStoreAppEntries({ ...base, apps: [app({})], isUsageView })).toEqual([])
    const panels = { hello: { appId: 'hello', title: 'Hello', icon: () => null, component: () => null, requiresProject: false } }
    expect(buildStoreAppEntries({ ...base, apps: [app({})], panels, isUsageView })).toEqual([])
    expect(buildStoreAppEntries({ ...base, apps: [app({ status: 'failed', error: 'bad' })], isUsageView })).toEqual([])
    const disabled = { apps: [app({ status: 'disabled' })], setEnabled: vi.fn(), uninstall: vi.fn(), isUsageView }
    expect(buildStoreDisabledEntries(disabled)).toEqual([])
  })
  it('lists a failed app inert with the error as tooltip', () => {
    const [e] = buildStoreAppEntries({ ...base, apps: [app({ status: 'failed', error: 'bad' })] })
    expect(e.subtitle).toBe('Failed to load')
    expect(e.tooltip).toBe('bad')
    expect(e.onOpen).toBeUndefined()
  })
  it('marks restart-required and hides requiresProject panels without a project', () => {
    expect(buildStoreAppEntries({ ...base, apps: [app({ status: 'restart-required' })] })[0].subtitle).toBe('Restart to finish')
    const panels = { hello: { appId: 'hello', title: 'Hello', icon: () => null, component: () => null, requiresProject: true } }
    expect(buildStoreAppEntries({ ...base, apps: [app({})], panels, projectOpen: false })).toEqual([])
    expect(buildStoreAppEntries({ ...base, apps: [app({})], panels })[0].onOpen).toBeTypeOf('function')
  })
})

describe('isUsageViewApp', () => {
  const view = { appId: 'gauge', title: 'Gauge', component: () => null }
  const registry = (category: string) =>
    ({ status: 'ok', apps: [{ id: 'gauge', category }] }) as unknown as RegistryState
  it("is true for an app in the Store's usage category, loaded or not", () => {
    expect(isUsageViewApp('gauge', registry('usage'), {})).toBe(true)
    expect(isUsageViewApp('gauge', registry('applications'), {})).toBe(false)
  })
  it('is true for an app that registered a usage view (installed from a file)', () => {
    expect(isUsageViewApp('gauge', null, { gauge: view })).toBe(true)
    expect(isUsageViewApp('gauge', null, {})).toBe(false)
  })
})

describe('disabled store apps', () => {
  it('leave the main list and show up in the Disabled section with Enable and Uninstall', async () => {
    const setEnabled = vi.fn().mockResolvedValue({ ok: true as const })
    const uninstall = vi.fn().mockResolvedValue({ ok: true as const })
    const apps = [app({ status: 'disabled' }), app({ id: 'other', name: 'Other' })]
    expect(buildStoreAppEntries({ ...base, apps }).map((e) => e.id)).toEqual(['app:other'])
    const [d] = buildStoreDisabledEntries({ apps, setEnabled, uninstall })
    expect(d).toMatchObject({ id: 'app:hello', title: 'Hello' })
    d.onEnable()
    expect(setEnabled).toHaveBeenCalledWith('hello', true)
    await d.onUninstall!()
    expect(uninstall).toHaveBeenCalledWith('hello')
  })
  it('an enabled store app gains Disable; a dev app does not', () => {
    const setEnabled = vi.fn().mockResolvedValue({ ok: true as const })
    const [store, dev] = buildStoreAppEntries({ ...base, setEnabled, apps: [app({}), app({ id: 'd', source: 'dev' })] })
    store.onDisable!()
    expect(setEnabled).toHaveBeenCalledWith('hello', false)
    expect(dev.onDisable).toBeUndefined()
  })
})

describe('sidebar helpers', () => {
  const mk = (requiresProject: boolean) => ({ hello: { appId: 'hello', title: 'H', icon: () => null, component: () => null, requiresProject } })
  it('leaves an app panel on project close when missing or project-bound', () => {
    expect(storeAppPanelLeavesOnProjectClose('app:hello', mk(true))).toBe(true)
    expect(storeAppPanelLeavesOnProjectClose('app:hello', {})).toBe(true)
    expect(storeAppPanelLeavesOnProjectClose('app:hello', mk(false))).toBe(false)
    expect(storeAppPanelLeavesOnProjectClose('files', mk(true))).toBe(false)
  })
  it('maps a panel request and detects badges', () => {
    expect(panelForRequest({ appId: 'hello' })).toBe('app:hello')
    expect(panelForRequest(null)).toBeNull()
    expect(storeEntriesHaveBadge([{ id: 'a', title: 'a', icon: null, favorite: false, badge: 2, onSettings: () => {} }])).toBe(true)
    expect(storeEntriesHaveBadge([{ id: 'a', title: 'a', icon: null, favorite: false, onSettings: () => {} }])).toBe(false)
  })
})

describe('buildStoreAppBarItems', () => {
  const panels = { hello: { appId: 'hello', title: 'Hello', icon: () => null, component: () => null, requiresProject: false, badge: 3 } }
  it('builds a bar item for an app with a panel', () => {
    const toggled: string[] = []
    const items = buildStoreAppBarItems({ apps: [app({})], runtimeErrors: {}, panels, projectOpen: true, activePanel: 'app:hello', togglePanel: (id) => toggled.push(id) })
    expect(items['app:hello']).toMatchObject({ id: 'app:hello', title: 'Hello', active: true, badge: 3 })
    items['app:hello'].onClick({} as never)
    expect(toggled).toEqual(['hello'])
  })
  it('skips apps without a panel, failed apps and project-bound panels with no project', () => {
    expect(buildStoreAppBarItems({ apps: [app({})], runtimeErrors: {}, panels: {}, projectOpen: true, activePanel: null, togglePanel: () => {} })).toEqual({})
    expect(buildStoreAppBarItems({ apps: [app({ status: 'failed' })], runtimeErrors: {}, panels, projectOpen: true, activePanel: null, togglePanel: () => {} })).toEqual({})
    const bound = { hello: { ...panels.hello, requiresProject: true } }
    expect(buildStoreAppBarItems({ apps: [app({})], runtimeErrors: {}, panels: bound, projectOpen: false, activePanel: null, togglePanel: () => {} })).toEqual({})
  })
})

describe('launchers', () => {
  const onClick = vi.fn()
  const launcher = (over: object = {}) => ({ hello: { appId: 'hello', title: 'Open GitHub', icon: () => null, onClick, visible: true, active: false, ...over } })
  it('builds a bar item for a launcher app without a panel', () => {
    const items = buildStoreAppBarItems({ apps: [app({})], runtimeErrors: {}, panels: {}, launchers: launcher({ active: true }), projectOpen: true, activePanel: null, togglePanel: () => {} })
    expect(items['app:hello']).toMatchObject({ id: 'app:hello', title: 'Open GitHub', active: true })
    items['app:hello'].onClick({} as never)
    expect(onClick).toHaveBeenCalled()
  })
  it('hides an invisible launcher from the bar', () => {
    expect(buildStoreAppBarItems({ apps: [app({})], runtimeErrors: {}, panels: {}, launchers: launcher({ visible: false }), projectOpen: true, activePanel: null, togglePanel: () => {} })).toEqual({})
  })
  it('lists a launcher app as favoritable in All Apps, opening runs the launcher', () => {
    onClick.mockClear()
    const [e] = buildStoreAppEntries({ ...base, apps: [app({})], launchers: launcher() })
    expect(e.favoritable).toBe(true)
    e.onOpen!({} as never)
    expect(onClick).toHaveBeenCalled()
  })
})
