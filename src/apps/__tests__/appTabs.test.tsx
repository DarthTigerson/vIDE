// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AppTabView, AppSettingsView } from '../AppTabViews'
import { useAppContribStore } from '../appContribStore'
import { buildAppTabPath } from '@/components/Settings/paths'

afterEach(() => { cleanup(); useAppContribStore.getState().clearApp('hello') })

describe('app tabs', () => {
  it('renders a registered tab kind with its params', () => {
    useAppContribStore.getState().registerTabKind({
      appId: 'hello', kind: 'note', title: () => 'Note',
      component: ({ params }) => <div>note:{String((params as { n: number }).n)}</div>,
    })
    render(<AppTabView path={buildAppTabPath('hello', 'note', { n: 7 })} />)
    expect(screen.getByText('note:7')).toBeTruthy()
  })

  it('shows a muted line when the app is not loaded', () => {
    render(<AppTabView path={buildAppTabPath('hello', 'note', null)} />)
    expect(screen.getByText("This app isn't loaded.")).toBeTruthy()
    cleanup()
    render(<AppSettingsView appId="hello" />)
    expect(screen.getByText("This app isn't loaded.")).toBeTruthy()
  })

  it('isolates a crashing tab and renders the settings page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAppContribStore.getState().registerTabKind({
      appId: 'hello', kind: 'boom', title: () => 'Boom',
      component: () => { throw new Error('kaboom') },
    })
    render(<AppTabView path={buildAppTabPath('hello', 'boom', null)} />)
    expect(screen.getByText('Boom stopped working.')).toBeTruthy()
    expect(screen.getByText('kaboom')).toBeTruthy()
    expect(useAppContribStore.getState().runtimeErrors.hello).toBe('kaboom')
    cleanup()
    useAppContribStore.getState().registerSettingsPage({ appId: 'hello', title: 'Hello', component: () => <div>hello settings</div> })
    render(<AppSettingsView appId="hello" />)
    expect(screen.getByText('hello settings')).toBeTruthy()
  })

  it('survives a title() that throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAppContribStore.getState().registerTabKind({
      appId: 'hello', kind: 'bad', title: () => { throw new Error('t') },
      component: () => <div>body ok</div>,
    })
    render(<AppTabView path={buildAppTabPath('hello', 'bad', null)} />)
    expect(screen.getByText('body ok')).toBeTruthy()
  })
})
