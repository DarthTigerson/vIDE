// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged: vi.fn() }))
vi.mock('@/stores/peekEventStore', () => ({ usePeekEventStore: { getState: () => ({ show: vi.fn() }) } }))

import { notifySettingChanged } from '@/lib/notifySettingChanged'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { buildAppTabPath, buildAppSettingsPath } from '@/components/Settings/paths'
import { useAppContribStore } from '../appContribStore'
import { createVideApi } from '../createVideApi'

const mockApi = {
  appsCall: vi.fn(async () => 'result'),
  onAppsEvent: vi.fn(),
}
let emit: (appId: string, event: string, payload: unknown) => void = () => {}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockApi.onAppsEvent.mockImplementation((cb: typeof emit) => { emit = cb; return () => { emit = () => {} } })
  ;(window as unknown as { api: unknown }).api = mockApi
  useAppContribStore.setState({
    apps: [], runtimeErrors: {}, panels: {}, settingsPages: {}, tabKinds: {},
    commands: [], notifications: [], panelRequest: null,
  })
})

const make = () => createVideApi({ id: 'hello', name: 'Hello' })

describe('createVideApi', () => {
  it('settings use vide:<appId>:<key> raw strings and notify', () => {
    const v = make()
    const cb = vi.fn()
    v.settings.subscribe('k', cb)
    v.settings.set('k', 'true')
    expect(localStorage.getItem('vide:hello:k')).toBe('true')
    expect(v.settings.get('k')).toBe('true')
    expect(notifySettingChanged).toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith('true')
    v.settings.set('k', null)
    expect(localStorage.getItem('vide:hello:k')).toBeNull()
    expect(cb).toHaveBeenLastCalledWith(null)
  })

  it('registers commands with prefixed id and label, and disposes', () => {
    const v = make()
    const d = v.commands.register({ id: 'ping', label: 'Ping', disabledReason: () => undefined, action: () => {} })
    const c = useAppContribStore.getState().commands[0].command
    expect(c.id).toBe('app:hello:ping')
    expect(c.label).toBe('Hello: Ping')
    expect(c.disabledReason?.()).toBeNull()
    d.dispose()
    expect(useAppContribStore.getState().commands).toEqual([])
  })

  it('notifications push and dispose', () => {
    const v = make()
    const d = v.notifications.push({ id: 'n1', text: 'hi' })
    expect(useAppContribStore.getState().notifications).toHaveLength(1)
    d.dispose()
    expect(useAppContribStore.getState().notifications).toHaveLength(0)
  })

  it('app.call forwards and app.on filters by appId', async () => {
    const v = make()
    await expect(v.app.call('m', { a: 1 })).resolves.toBe('result')
    expect(mockApi.appsCall).toHaveBeenCalledWith('hello', 'm', { a: 1 })
    const cb = vi.fn()
    v.app.on('ev', cb)
    emit('other', 'ev', 1)
    emit('hello', 'other-ev', 2)
    emit('hello', 'ev', 3)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(3)
  })

  it('ui.openTab / openSettings open editor tabs, openPanel requests', () => {
    const open = vi.fn()
    useEditorStore.setState({ openTab: open })
    const v = make()
    v.ui.openTab('logs', { id: 1 })
    expect(open).toHaveBeenCalledWith({ path: buildAppTabPath('hello', 'logs', { id: 1 }), content: '', dirty: false })
    v.ui.openSettings()
    expect(open).toHaveBeenCalledWith({ path: buildAppSettingsPath('hello'), content: '', dirty: false })
    v.ui.openPanel()
    expect(useAppContribStore.getState().panelRequest).toEqual({ appId: 'hello', seq: 1 })
  })

  it('project.root reads and subscribes only on change', () => {
    useFileStore.setState({ projectRoot: '/a' })
    const v = make()
    expect(v.project.root()).toBe('/a')
    const cb = vi.fn()
    const off = v.project.subscribe(cb)
    useFileStore.setState({ projectRoot: '/a' })
    expect(cb).not.toHaveBeenCalled()
    useFileStore.setState({ projectRoot: '/b' })
    expect(cb).toHaveBeenCalledWith('/b')
    off()
  })

  it('registerSidebarPanel stores panel with badge', () => {
    const v = make()
    const C = () => null
    const p = v.ui.registerSidebarPanel({ title: 'T', icon: C, component: C })
    expect(useAppContribStore.getState().panels.hello.requiresProject).toBe(false)
    p.setBadge(2)
    expect(useAppContribStore.getState().panels.hello.badge).toBe(2)
    p.dispose()
    expect(useAppContribStore.getState().panels.hello).toBeUndefined()
  })

  it('tracked subscriptions are removed by disposers; explicit unsubscribe also stops them', () => {
    const disposers: Array<() => void> = []
    const v = createVideApi({ id: 'hello', name: 'Hello' }, disposers)
    useFileStore.setState({ projectRoot: '/a' })
    const sCb = vi.fn(); const pCb = vi.fn(); const eCb = vi.fn()
    const offS = v.settings.subscribe('k', sCb)
    v.project.subscribe(pCb)
    v.app.on('ev', eCb)
    offS()
    v.settings.set('k', '1')
    expect(sCb).not.toHaveBeenCalled()
    disposers.forEach((d) => d())
    useFileStore.setState({ projectRoot: '/z' })
    emit('hello', 'ev', 1)
    expect(pCb).not.toHaveBeenCalled()
    expect(eCb).not.toHaveBeenCalled()
    expect(mockApi.onAppsEvent).toHaveBeenCalled()
  })

  it('rejects bad tab kinds', () => {
    const v = make()
    expect(() => v.ui.registerTabKind('a/b', { title: () => '', component: () => null })).toThrow('bad tab kind')
    expect(() => v.ui.registerTabKind('Logs', { title: () => '', component: () => null })).toThrow('bad tab kind')
  })

  it('does not notify subscribers when the storage write fails', () => {
    const v = make()
    const cb = vi.fn()
    v.settings.subscribe('k', cb)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    v.settings.set('k', 'x')
    spy.mockRestore()
    expect(cb).not.toHaveBeenCalled()
  })
})
