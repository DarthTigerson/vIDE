/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { BrowserTab } from '../BrowserTab'
import { useBrowserStore } from '@/stores/browserStore'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserFavoritesStore } from '@/stores/browserFavoritesStore'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'
import { useNativeViewCoverStore } from '@/lib/nativeViewCover'
import { isMac } from '@/lib/platform'

// Captures the most recent onBrowserViewEvent callback so later tasks'
// tests can simulate main-process events (did-navigate, page-title-updated, ...).
export let lastEventCallback: ((id: string, event: any) => void) | null = null

function mockWindowApi() {
  lastEventCallback = null
  ;(global as any).window = (global as any).window ?? {}
  ;(global as any).window.api = {
    browserViewCreate: vi.fn().mockResolvedValue(101),
    browserViewSetVisible: vi.fn(),
    browserViewCapture: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
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
    browserViewClearCookies: vi.fn().mockResolvedValue(undefined),
    browserViewDestroy: vi.fn(),
    browserViewFind: vi.fn(),
    browserViewStopFind: vi.fn(),
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
  useNativeViewCoverStore.setState({ count: 0 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BrowserTab', () => {
  it('opens a page-opened window in a new tab using the id main already registered (VIDE-18)', () => {
    useEditorStore.setState({ tabs: [{ path: 'browser://opener', content: '', dirty: false }] } as any)
    useBrowserStore.getState().ensureTab('opener', 'https://app.example.com')
    render(<BrowserTab browserId="opener" />)
    act(() => lastEventCallback!('opener', { type: 'open-in-new-tab', url: 'https://idp.example.com/login', tabId: 'popup1' }))
    expect(useBrowserStore.getState().tabs['popup1']?.url).toBe('https://idp.example.com/login')
    expect(useEditorStore.getState().tabs.some((t) => t.path === 'browser://popup1')).toBe(true)
  })

  it('closes its editor tab when the page closes itself (VIDE-18)', () => {
    useEditorStore.setState({ tabs: [{ path: 'browser://popup1', content: '', dirty: false }] } as any)
    useBrowserStore.getState().ensureTab('popup1', 'https://idp.example.com/done')
    render(<BrowserTab browserId="popup1" />)
    act(() => lastEventCallback!('popup1', { type: 'closed-by-page' }))
    expect(useEditorStore.getState().tabs.some((t) => t.path === 'browser://popup1')).toBe(false)
  })

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

  // A tab seeded with a url before mount (Jira, git-remote, and the
  // Claude-controlled tab) registers its native view at mount, so the next
  // navigation must go through browserViewNavigate — a second
  // browserViewCreate would be a no-op in the main process and silently drop
  // the navigation.
  it('a tab seeded with a url navigates the existing view instead of re-creating it', () => {
    useBrowserStore.getState().ensureTab('tab-10', 'https://example.com')
    const { container } = render(<BrowserTab browserId="tab-10" />)
    expect(window.api.browserViewCreate).toHaveBeenCalledTimes(1)

    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'other.com' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(window.api.browserViewNavigate).toHaveBeenCalledWith('tab-10', 'https://other.com')
    expect(window.api.browserViewCreate).toHaveBeenCalledTimes(1)
  })

  it('does not record visits or closed tabs for the Claude-controlled tab', () => {
    const { unmount } = render(<BrowserTab browserId="claude-controlled" />)
    lastEventCallback!('claude-controlled', {
      type: 'did-navigate',
      url: 'https://example.com',
      canGoBack: false,
      canGoForward: false,
    })
    lastEventCallback!('claude-controlled', { type: 'page-title-updated', title: 'Example Domain' })

    expect(useBrowserRecentStore.getState().entries).toHaveLength(0)

    unmount()

    expect(useBrowserClosedTabsStore.getState().entries).toHaveLength(0)
  })

  it('Home is disabled while already on the landing page', () => {
    const { getByLabelText } = render(<BrowserTab browserId="tab-11" />)
    expect(getByLabelText('Home')).toBeDisabled()
  })

  it('clicking Home returns a browsing tab to the landing page without destroying the view', () => {
    useBrowserStore.getState().ensureTab('tab-12', 'https://example.com')
    useBrowserStore.getState().updateTab('tab-12', { title: 'Example Domain', canGoBack: true })

    const { getByLabelText, getByText } = render(<BrowserTab browserId="tab-12" />)
    fireEvent.click(getByLabelText('Home'))

    expect(useBrowserStore.getState().tabs['tab-12'].url).toBe('')
    expect(useBrowserStore.getState().tabs['tab-12'].canGoBack).toBe(false)
    expect(window.api.browserViewDestroy).not.toHaveBeenCalled()
    expect(getByText('Star the address bar on any page to pin it here.')).toBeTruthy()
  })

  it('opens the clear browsing data modal from the clear dropdown', () => {
    useBrowserStore.getState().ensureTab('tab-13', 'https://example.com')
    const { getByLabelText, getByText, queryByText } = render(<BrowserTab browserId="tab-13" />)

    expect(queryByText('Clear browsing data')).toBeNull()
    fireEvent.click(getByLabelText('Zoom controls'))
    fireEvent.click(getByLabelText('Clear browsing data'))
    fireEvent.click(getByText('Choose what to clear…'))

    expect(getByText('Clear browsing data')).toBeTruthy()
  })

  it('clears cookies straight from the clear dropdown', async () => {
    useBrowserStore.getState().ensureTab('tab-14', 'https://example.com')
    const { getByLabelText, getByText, queryByText } = render(<BrowserTab browserId="tab-14" />)
    fireEvent.click(getByLabelText('Zoom controls'))
    fireEvent.click(getByLabelText('Clear browsing data'))
    fireEvent.click(getByText('Clear cookies'))
    await waitFor(() => expect(window.api.browserViewClearCookies).toHaveBeenCalledWith('tab-14'))
    expect(window.api.browserViewClearCache).not.toHaveBeenCalled()
    expect(queryByText('Clear cache')).toBeNull()
  })

  it('the device dropdown switches between a phone and Desktop', () => {
    useBrowserStore.getState().ensureTab('tab-15', 'https://example.com')
    const { getByLabelText, getByText } = render(<BrowserTab browserId="tab-15" />)
    fireEvent.click(getByLabelText('Zoom controls'))
    expect(getByLabelText('Device').textContent).toContain('Desktop')

    fireEvent.click(getByLabelText('Device'))
    fireEvent.click(getByText('iPhone SE'))
    expect(useBrowserStore.getState().tabs['tab-15']).toMatchObject({ mobileMode: true, mobileDeviceId: 'iphone-se' })
    expect(window.api.browserViewSetMobileMode).toHaveBeenLastCalledWith('tab-15', true, expect.objectContaining({ id: 'iphone-se' }))
    expect(getByLabelText('Device').textContent).toContain('iPhone SE')

    fireEvent.click(getByLabelText('Device'))
    fireEvent.click(getByText('Desktop'))
    expect(useBrowserStore.getState().tabs['tab-15'].mobileMode).toBe(false)
    expect(window.api.browserViewSetMobileMode).toHaveBeenLastCalledWith('tab-15', false, undefined)
  })
})

describe('BrowserTab — popups over the page', () => {
  it('swaps the live page for a snapshot while a popup is open, then brings it back', async () => {
    useBrowserStore.getState().ensureTab('tab-cover', 'https://example.com')
    const { container } = render(<BrowserTab browserId="tab-cover" />)
    expect(window.api.browserViewSetVisible).toHaveBeenLastCalledWith('tab-cover', true)

    let release = () => {}
    act(() => { release = useNativeViewCoverStore.getState().cover() })
    await waitFor(() => expect(window.api.browserViewSetVisible).toHaveBeenLastCalledWith('tab-cover', false))
    expect(window.api.browserViewCapture).toHaveBeenCalledWith('tab-cover')
    expect(container.querySelector('img[data-browser-snapshot]')).toHaveAttribute('src', 'data:image/png;base64,AAA')

    act(() => release())
    expect(window.api.browserViewSetVisible).toHaveBeenLastCalledWith('tab-cover', true)
    expect(container.querySelector('img[data-browser-snapshot]')).toBeNull()
  })

  it('still hides the page when the snapshot fails', async () => {
    ;(window.api.browserViewCapture as any).mockResolvedValueOnce(null)
    useBrowserStore.getState().ensureTab('tab-fail', 'https://example.com')
    const { container } = render(<BrowserTab browserId="tab-fail" />)
    act(() => { useNativeViewCoverStore.getState().cover() })
    await waitFor(() => expect(window.api.browserViewSetVisible).toHaveBeenLastCalledWith('tab-fail', false))
    expect(container.querySelector('img[data-browser-snapshot]')).toBeNull()
  })

  it('does not hide the page if the popup closes before the snapshot arrives', async () => {
    let resolveCapture: (v: string) => void = () => {}
    ;(window.api.browserViewCapture as any).mockReturnValueOnce(new Promise((r) => { resolveCapture = r }))
    useBrowserStore.getState().ensureTab('tab-race', 'https://example.com')
    render(<BrowserTab browserId="tab-race" />)
    let release = () => {}
    act(() => { release = useNativeViewCoverStore.getState().cover() })
    act(() => release())
    await act(async () => { resolveCapture('data:image/png;base64,BBB') })
    expect(window.api.browserViewSetVisible).toHaveBeenLastCalledWith('tab-race', true)
  })
})

describe('BrowserTab find in page', () => {
  function setup(id: string) {
    useBrowserStore.getState().ensureTab(id, 'https://example.com')
    return render(<BrowserTab browserId={id} />)
  }

  it('opens the find box when the main process reports Cmd+F inside the page', () => {
    const { queryByLabelText, getByLabelText } = setup('tab-find-1')
    expect(queryByLabelText('Find text')).toBeNull()
    act(() => lastEventCallback!('tab-find-1', { type: 'find-requested' }))
    expect(getByLabelText('Find text')).toBeTruthy()
    expect(document.activeElement).toBe(getByLabelText('Find text'))
  })

  it('opens the find box on Cmd+F from inside the tab chrome', () => {
    const { container, getByLabelText } = setup('tab-find-2')
    fireEvent.keyDown(container.querySelector('input') as HTMLInputElement, { key: 'f', ...(isMac ? { metaKey: true } : { ctrlKey: true }) })
    expect(getByLabelText('Find text')).toBeTruthy()
  })

  it('searches as you type, steps with Enter / Shift+Enter, and shows n of m', () => {
    const { getByLabelText, getByText } = setup('tab-find-3')
    act(() => lastEventCallback!('tab-find-3', { type: 'find-requested' }))
    const input = getByLabelText('Find text')
    fireEvent.change(input, { target: { value: 'foo' } })
    expect(window.api.browserViewFind).toHaveBeenLastCalledWith('tab-find-3', 'foo')

    act(() => lastEventCallback!('tab-find-3', { type: 'find-result', activeMatchOrdinal: 2, matches: 5 }))
    expect(getByText('2 of 5')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(window.api.browserViewFind).toHaveBeenLastCalledWith('tab-find-3', 'foo', { forward: true, findNext: true })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(window.api.browserViewFind).toHaveBeenLastCalledWith('tab-find-3', 'foo', { forward: false, findNext: true })
    fireEvent.click(getByLabelText('Previous match'))
    expect(window.api.browserViewFind).toHaveBeenLastCalledWith('tab-find-3', 'foo', { forward: false, findNext: true })
  })

  it('shows No results when nothing matches', () => {
    const { getByLabelText, getByText } = setup('tab-find-4')
    act(() => lastEventCallback!('tab-find-4', { type: 'find-requested' }))
    fireEvent.change(getByLabelText('Find text'), { target: { value: 'zzz' } })
    act(() => lastEventCallback!('tab-find-4', { type: 'find-result', activeMatchOrdinal: 0, matches: 0 }))
    expect(getByText('No results')).toBeTruthy()
  })

  it('closes on Escape and on the close button, clearing the selection', () => {
    const { getByLabelText, queryByLabelText } = setup('tab-find-5')
    act(() => lastEventCallback!('tab-find-5', { type: 'find-requested' }))
    fireEvent.keyDown(getByLabelText('Find text'), { key: 'Escape' })
    expect(queryByLabelText('Find text')).toBeNull()
    expect(window.api.browserViewStopFind).toHaveBeenCalledWith('tab-find-5')

    act(() => lastEventCallback!('tab-find-5', { type: 'find-requested' }))
    fireEvent.click(getByLabelText('Close find'))
    expect(queryByLabelText('Find text')).toBeNull()
    expect(window.api.browserViewStopFind).toHaveBeenCalledTimes(2)
  })

  it('clearing the text stops the search without pulling focus into the page', () => {
    const { getByLabelText } = setup('tab-find-7')
    act(() => lastEventCallback!('tab-find-7', { type: 'find-requested' }))
    const input = getByLabelText('Find text')
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(window.api.browserViewStopFind).toHaveBeenLastCalledWith('tab-find-7', false)
  })

  it('the magnifier in the tools row opens and closes find', () => {
    const { getByLabelText, queryByLabelText } = setup('tab-find-8')
    fireEvent.click(getByLabelText('Zoom controls'))
    fireEvent.click(getByLabelText('Find in page'))
    expect(document.activeElement).toBe(getByLabelText('Find text'))
    fireEvent.click(getByLabelText('Find in page'))
    expect(queryByLabelText('Find text')).toBeNull()
    expect(window.api.browserViewStopFind).toHaveBeenCalledWith('tab-find-8')
  })

  it('ignores find events for other tabs', () => {
    const { queryByLabelText } = setup('tab-find-6')
    act(() => lastEventCallback!('other-tab', { type: 'find-requested' }))
    expect(queryByLabelText('Find text')).toBeNull()
  })
})

