import { describe, it, expect, beforeEach } from 'vitest'
import { useAppContribStore } from '../appContribStore'

const C = () => null
const s = () => useAppContribStore.getState()

beforeEach(() => {
  useAppContribStore.setState({
    apps: [], runtimeErrors: {}, panels: {}, settingsPages: {}, tabKinds: {},
    commands: [], notifications: [], panelRequest: null,
  })
})

describe('appContribStore', () => {
  it('registers and unregisters each kind', () => {
    s().registerPanel({ appId: 'a', title: 'A', icon: C, component: C, requiresProject: false })
    s().registerSettingsPage({ appId: 'a', title: 'A', component: C })
    s().registerTabKind({ appId: 'a', kind: 'k', title: () => 't', component: C })
    s().registerCommand({ appId: 'a', command: { id: 'app:a:x', label: 'A: x', action: () => {} } })
    s().registerNotification({ appId: 'a', id: 'n', text: 'hi' })
    expect(Object.keys(s().panels)).toEqual(['a'])
    expect(Object.keys(s().tabKinds)).toEqual(['a/k'])
    s().setPanelBadge('a', 3)
    expect(s().panels.a.badge).toBe(3)
    s().unregisterPanel('a'); s().unregisterSettingsPage('a'); s().unregisterTabKind('a', 'k')
    s().unregisterCommand('app:a:x'); s().unregisterNotification('a', 'n')
    expect(s().panels).toEqual({}); expect(s().settingsPages).toEqual({}); expect(s().tabKinds).toEqual({})
    expect(s().commands).toEqual([]); expect(s().notifications).toEqual([])
  })

  it('clearApp removes everything the app registered, only that app', () => {
    for (const id of ['a', 'b']) {
      s().registerPanel({ appId: id, title: id, icon: C, component: C, requiresProject: false })
      s().registerSettingsPage({ appId: id, title: id, component: C })
      s().registerTabKind({ appId: id, kind: 'k', title: () => 't', component: C })
      s().registerCommand({ appId: id, command: { id: `app:${id}:x`, label: 'x', action: () => {} } })
      s().registerNotification({ appId: id, id: 'n', text: 'hi' })
    }
    s().setRuntimeError('a', 'boom')
    s().clearApp('a')
    expect(Object.keys(s().panels)).toEqual(['b'])
    expect(Object.keys(s().settingsPages)).toEqual(['b'])
    expect(Object.keys(s().tabKinds)).toEqual(['b/k'])
    expect(s().commands.map((c) => c.appId)).toEqual(['b'])
    expect(s().notifications.map((c) => c.appId)).toEqual(['b'])
    expect(s().runtimeErrors.a).toBeUndefined()
  })

  it('setRuntimeError sets and clears', () => {
    s().setRuntimeError('a', 'x'); expect(s().runtimeErrors.a).toBe('x')
    s().setRuntimeError('a', null); expect(s().runtimeErrors.a).toBeUndefined()
  })

  it('requestPanel bumps seq', () => {
    s().requestPanel('a'); s().requestPanel('a')
    expect(s().panelRequest).toEqual({ appId: 'a', seq: 2 })
  })
})
