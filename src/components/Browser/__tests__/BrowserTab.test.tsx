/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { BrowserTab } from '../BrowserTab'
import { useBrowserStore } from '@/stores/browserStore'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserFavoritesStore } from '@/stores/browserFavoritesStore'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'

// Captures the most recent onBrowserViewEvent callback so later tasks'
// tests can simulate main-process events (did-navigate, page-title-updated, ...).
export let lastEventCallback: ((id: string, event: any) => void) | null = null

function mockWindowApi() {
  lastEventCallback = null
  ;(global as any).window = (global as any).window ?? {}
  ;(global as any).window.api = {
    browserViewCreate: vi.fn().mockResolvedValue(101),
    browserViewSetVisible: vi.fn(),
    browserViewSetBounds: vi.fn(),
    browserViewNavigate: vi.fn(),
    browserViewGoBack: vi.fn(),
    browserViewGoForward: vi.fn(),
    browserViewReload: vi.fn(),
    browserViewZoomIn: vi.fn(),
    browserViewZoomOut: vi.fn(),
    browserViewZoomReset: vi.fn(),
    browserViewSetMobileMode: vi.fn(),
    browserViewClearCache: vi.fn().mockResolvedValue(undefined),
    browserViewDestroy: vi.fn(),
    onBrowserViewEvent: vi.fn((cb: (id: string, event: any) => void) => {
      lastEventCallback = cb
      return () => {}
    }),
  }
}

beforeEach(() => {
  mockWindowApi()
  useBrowserStore.setState({ tabs: {}, fullscreenId: null })
  useEditorStore.setState({ tabs: [] } as any)
  useBrowserFavoritesStore.setState({ favorites: {} })
  useBrowserRecentStore.setState({ entries: [] })
  useBrowserClosedTabsStore.setState({ entries: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BrowserTab', () => {
  it('a brand-new tab does not create a native view and shows the landing page', () => {
    const { getByText } = render(<BrowserTab browserId="tab-1" />)
    expect(window.api.browserViewCreate).not.toHaveBeenCalled()
    expect(getByText('Star the address bar on any page to pin it here.')).toBeTruthy()
  })

  it('a tab that already has a url creates the native view on mount and hides the landing page', () => {
    useBrowserStore.getState().ensureTab('tab-2', 'https://example.com')
    const { queryByText } = render(<BrowserTab browserId="tab-2" />)
    expect(window.api.browserViewCreate).toHaveBeenCalledWith('tab-2', 'https://example.com')
    expect(queryByText('Star the address bar on any page to pin it here.')).toBeNull()
  })

  it('submitting the address bar from the landing page creates the view and navigates', () => {
    const { container } = render(<BrowserTab browserId="tab-3" />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(window.api.browserViewCreate).toHaveBeenCalledWith('tab-3', 'https://example.com')
    expect(useBrowserStore.getState().tabs['tab-3'].url).toBe('https://example.com')
  })

  it('clicking a landing-page row navigates the same way as the address bar', () => {
    useBrowserStore.getState().ensureTab('tab-4', '')
    // Seed a favorite so the landing page has a clickable row.
    useBrowserFavoritesStore.getState().toggleFavorite('https://example.com', 'Example Domain')

    const { getByText } = render(<BrowserTab browserId="tab-4" />)
    fireEvent.click(getByText('Example Domain'))

    expect(window.api.browserViewCreate).toHaveBeenCalledWith('tab-4', 'https://example.com')
  })

  it('records a visit in the recent store on navigation, refining the title once known', () => {
    render(<BrowserTab browserId="tab-5" />)
    lastEventCallback!('tab-5', { type: 'did-navigate', url: 'https://example.com', canGoBack: false, canGoForward: false })

    expect(useBrowserRecentStore.getState().entries[0]).toMatchObject({
      url: 'https://example.com',
      title: 'https://example.com',
    })

    lastEventCallback!('tab-5', { type: 'page-title-updated', title: 'Example Domain' })

    expect(useBrowserRecentStore.getState().entries[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example Domain',
    })
  })

  it('records a closed tab when a tab that had navigated somewhere unmounts', () => {
    const { unmount } = render(<BrowserTab browserId="tab-6" />)
    lastEventCallback!('tab-6', { type: 'did-navigate', url: 'https://example.com', canGoBack: false, canGoForward: false })
    lastEventCallback!('tab-6', { type: 'page-title-updated', title: 'Example Domain' })

    unmount()

    expect(useBrowserClosedTabsStore.getState().entries[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example Domain',
    })
  })

  it('does not record a closed tab for an unvisited landing-page tab', () => {
    const { unmount } = render(<BrowserTab browserId="tab-7" />)
    unmount()
    expect(useBrowserClosedTabsStore.getState().entries).toHaveLength(0)
  })

  it('toggles favorite for the current page from the toolbar star', () => {
    useBrowserStore.getState().ensureTab('tab-8', 'https://example.com')
    useBrowserStore.getState().updateTab('tab-8', { title: 'Example Domain' })

    const { getByLabelText } = render(<BrowserTab browserId="tab-8" />)
    fireEvent.click(getByLabelText('Add to favorites'))
    expect(useBrowserFavoritesStore.getState().isFavorite('https://example.com')).toBe(true)

    fireEvent.click(getByLabelText('Remove from favorites'))
    expect(useBrowserFavoritesStore.getState().isFavorite('https://example.com')).toBe(false)
  })

  it('does not show a favorite star on the landing page itself', () => {
    const { queryByLabelText } = render(<BrowserTab browserId="tab-9" />)
    expect(queryByLabelText('Add to favorites')).toBeNull()
  })
})
