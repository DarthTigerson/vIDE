import { describe, it, expect } from 'vitest'
import { buildStoreAppEntries, storeAppPanelLeavesOnProjectClose, panelForRequest, storeEntriesHaveBadge } from '../storeAppItems'
import type { AppInfo } from '../../../electron/apps/appTypes'

const app = (over: Partial<AppInfo>): AppInfo => ({
  id: 'hello', name: 'Hello', version: '1.0.0', source: 'store', rendererUrl: '', hasMain: false,
  contributes: {} as AppInfo['contributes'], status: 'loaded', ...over,
})
const base = { runtimeErrors: {}, panels: {}, settingsPages: {}, projectOpen: true, openPanel: () => {}, openSettings: () => {}, uninstall: async () => ({ ok: true as const }) }

describe('buildStoreAppEntries', () => {
  it('lists a loaded app as non-favoritable with uninstall', () => {
    const [e] = buildStoreAppEntries({ ...base, apps: [app({})] })
    expect(e.favoritable).toBe(false)
    expect(e.onUninstall).toBeTypeOf('function')
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
