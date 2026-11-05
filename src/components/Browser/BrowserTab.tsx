import { useNativeViewCoverStore } from '@/lib/nativeViewCover'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBrowserStore } from '@/stores/browserStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildBrowserPath } from '@/components/Settings/paths'
import { normalizeUrlInput } from './urlBar'
import { zoomLevelToPercent } from './zoomLevel'
import { MOBILE_DEVICES, getMobileDevice } from './mobileDevices'
import { useSearchStore } from '@/stores/searchStore'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'
import { useBrowserFavoritesStore } from '@/stores/browserFavoritesStore'
import { BrowserLandingPage } from './BrowserLandingPage'
import { StarIcon } from './StarIcon'
import { ClearBrowsingDataModal } from './ClearBrowsingDataModal'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { isMac } from '@/lib/platform'

interface Props {
  browserId: string
}

// Module-level set tracks which browser ids already have a live WebContentsView
// in the main process, so remounts (pane moves, tab switches) reattach/show
// instead of recreating and losing navigation/session state — same pattern
// TerminalTab.tsx uses for PTYs, adapted for a main-process-owned view instead
// of a DOM node.
const liveBrowserViews = new Set<string>()

// Must match CLAUDE_TAB_ID in electron/browserViews.ts (and CLAUDE_BROWSER_ID
// in src/App.tsx) — the reserved id of the tab the vide-browser MCP server
// drives on Claude's behalf. Its navigations are Claude's, not the user's, so
// they're excluded from the Recent/Closed-tabs history the landing page shows:
// one MCP session can fire dozens of did-navigate events and would otherwise
// flush the user's own list.
const CLAUDE_BROWSER_ID = 'claude-controlled'

function boundsEqual(a: DOMRect, b: DOMRect | null): boolean {
  return !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function BrowserTab({ browserId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editingRef = useRef(false)
  // Shared with the mount effect's rAF bounds-sync loop (below) and with
  // goTo() (which can create a view well after mount, from a landing-page
  // navigation) — a ref rather than a plain closure variable so both can
  // read/reset it.
  const lastRectRef = useRef<DOMRect | null>(null)
  // Flips true once the mount effect's cleanup runs, so a goTo()-triggered
  // browserViewCreate promise that resolves after unmount doesn't write a
  // phantom entry back into browserStore for a tab that's already gone.
  const unmountedRef = useRef(false)
  const tabState = useBrowserStore((s) => s.tabs[browserId])
  const [urlDraft, setUrlDraft] = useState(tabState?.url ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleButtonRef = useRef<HTMLButtonElement>(null)
  // The ⋮ row's two dropdowns (device on the left, clear data on the right).
  // Only one is open at a time; either covers the native page view, which
  // would otherwise draw over the menu.
  const [openDropdown, setOpenDropdown] = useState<'device' | 'clear' | null>(null)
  useCoverNativeViews(openDropdown !== null)
  const deviceButtonRef = useRef<HTMLButtonElement>(null)
  const clearButtonRef = useRef<HTMLButtonElement>(null)
  const [clearDataOpen, setClearDataOpen] = useState(false)
  const findInputRef = useRef<HTMLInputElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findResult, setFindResult] = useState<{ active: number; total: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    unmountedRef.current = false

    useBrowserStore.getState().ensureTab(browserId, '')

    let cancelled = false
    // Claude's own browsing stays out of the user's Recent/Closed history.
    const isClaudeTab = browserId === CLAUDE_BROWSER_ID
    const initialUrl = useBrowserStore.getState().tabs[browserId]?.url ?? ''
    const alreadyLive = liveBrowserViews.has(browserId)

    // A brand-new tab with no url yet (the landing page) gets no native view
    // at all until goTo() is called — either from the address bar or from a
    // landing-page row.
    if (initialUrl && !alreadyLive) {
      liveBrowserViews.add(browserId)
      window.api.browserViewCreate(browserId, initialUrl).then((webContentsId) => {
        if (cancelled || webContentsId == null) return
        useBrowserStore.getState().updateTab(browserId, { webContentsId })
      })
    } else if (alreadyLive) {
      window.api.browserViewSetVisible(browserId, true)
    }

    const cleanupEvent = window.api.onBrowserViewEvent((id, event) => {
      if (id !== browserId) return
      switch (event.type) {
        case 'did-start-loading':
          useBrowserStore.getState().updateTab(browserId, { isLoading: true, loadError: null })
          break
        case 'did-stop-loading':
          useBrowserStore.getState().updateTab(browserId, {
            isLoading: false,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
          })
          break
        case 'did-navigate':
          if (!isClaudeTab) useBrowserRecentStore.getState().recordVisit(event.url, event.url)
          useBrowserStore.getState().updateTab(browserId, {
            url: event.url,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
          })
          if (!editingRef.current) setUrlDraft(event.url)
          break
        case 'did-navigate-in-page':
          useBrowserStore.getState().updateTab(browserId, {
            url: event.url,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
          })
          if (!editingRef.current) setUrlDraft(event.url)
          break
        case 'page-title-updated': {
          useBrowserStore.getState().updateTab(browserId, { title: event.title })
          const currentUrl = useBrowserStore.getState().tabs[browserId]?.url
          if (currentUrl && !isClaudeTab) useBrowserRecentStore.getState().recordVisit(currentUrl, event.title)
          break
        }
        case 'did-fail-load':
          useBrowserStore.getState().updateTab(browserId, {
            isLoading: false,
            loadError: event.errorDescription || 'This page could not be loaded.',
          })
          break
        case 'dom-ready':
          useBrowserStore.getState().updateTab(browserId, { webContentsId: event.webContentsId })
          break
        case 'zoom-changed':
          useBrowserStore.getState().updateTab(browserId, { zoomLevel: event.level })
          break
        case 'closed-by-page':
          // The page called window.close() (e.g. an OAuth popup finishing
          // sign-in); main has already dropped the view, so the unmount
          // cleanup's browserViewDestroy is a harmless no-op.
          useEditorStore.getState().closeTabEverywhere(buildBrowserPath(browserId))
          break
        case 'find-requested':
          setFindOpen(true)
          // The input may already be mounted (box open, focus in the page).
          findInputRef.current?.focus()
          findInputRef.current?.select()
          break
        case 'find-result':
          setFindResult({ active: event.activeMatchOrdinal, total: event.matches })
          break
        case 'open-in-new-tab': {
          // event.tabId: main already holds the opened page's view under that
          // id (keeping window.opener), and browserViewCreate will adopt it.
          const newId = event.tabId ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
          useBrowserStore.getState().ensureTab(newId, event.url)
          useEditorStore
            .getState()
            .openTabAfter({ path: buildBrowserPath(newId), content: '', dirty: false }, buildBrowserPath(browserId))
          break
        }
      }
    })

    // WebContentsView is a native layer composited above the window's DOM
    // content, not a DOM node itself — its bounds have to be measured and
    // pushed over IPC instead of just living in the flex layout. Polling via
    // rAF (rather than a ResizeObserver on this element) catches reflows that
    // only move the pane — sidebar toggle, split-divider drag — without
    // changing this element's own size, which a ResizeObserver would miss.
    lastRectRef.current = null
    let rafId: number
    const syncBounds = () => {
      const containerRect = container.getBoundingClientRect()
      const tab = useBrowserStore.getState().tabs[browserId]
      let rect = containerRect
      if (tab?.mobileMode) {
        // Frame the guest at (up to) its real device size, centered in the pane, rather
        // than stretching it to fill the container — the emulated CSS viewport set via
        // browserViewSetMobileMode only matches a real device if the on-screen surface
        // is actually that size. Clamped to the container so it never overlaps neighboring
        // panes when the pane is narrower than the device.
        const device = getMobileDevice(tab.mobileDeviceId)
        const width = Math.min(device.width, containerRect.width)
        const height = Math.min(device.height, containerRect.height)
        rect = new DOMRect(
          containerRect.x + (containerRect.width - width) / 2,
          containerRect.y + (containerRect.height - height) / 2,
          width,
          height
        )
      }
      if (!boundsEqual(rect, lastRectRef.current)) {
        lastRectRef.current = rect
        if (rect.width > 0 && rect.height > 0) {
          window.api.browserViewSetBounds(browserId, {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          })
        }
      }
      rafId = requestAnimationFrame(syncBounds)
    }
    rafId = requestAnimationFrame(syncBounds)

    return () => {
      cancelled = true
      unmountedRef.current = true
      cleanupEvent()
      cancelAnimationFrame(rafId)

      const tabPath = buildBrowserPath(browserId)
      const stillOpen = useEditorStore.getState().tabs.some((t) => t.path === tabPath)
      if (!stillOpen) {
        // A landing-page tab that was never navigated has no url — nothing
        // worth remembering as a "closed tab" in that case. Neither is the
        // Claude-controlled tab, whose pages the user never chose to open.
        const closingTab = useBrowserStore.getState().tabs[browserId]
        if (closingTab?.url && !isClaudeTab) {
          useBrowserClosedTabsStore.getState().recordClosed(closingTab.url, closingTab.title || closingTab.url)
        }
        liveBrowserViews.delete(browserId)
        useBrowserStore.getState().removeTab(browserId)
        window.api.browserViewDestroy(browserId)
      } else {
        // Leave the guest alive in the main process, just detached from view,
        // so the next mount (e.g. pane move) can show it with session intact.
        window.api.browserViewSetVisible(browserId, false)
      }
    }
  }, [browserId])

  const loadError = tabState?.loadError ?? null
  const url = tabState?.url ?? ''

  // The native view always draws on top of this component's own DOM — and, for
  // the same reason, above every other DOM-rendered surface in the window, palettes
  // and modals included, no matter their z-index. So the inline "page couldn't load"
  // state and any open palette/modal both have to explicitly hide it instead of
  // just rendering over it. The zoom panel below doesn't need this: it's laid out
  // in normal flow, so it pushes the native view's bounds down via the rAF sync
  // above rather than overlapping it.
  const anyOverlayOpen = useSearchStore(
    (s) =>
      s.commandPaletteOpen ||
      s.actionPaletteOpen ||
      s.shortcutsOverlayOpen ||
      s.recentProjectsPaletteOpen ||
      s.branchPaletteOpen
  )
  const coveredByPopup = useNativeViewCoverStore((s) => s.count > 0)
  const covered = anyOverlayOpen || coveredByPopup
  const pageShown = !!url && !loadError
  // While covered, a still snapshot of the page stands in for the native view
  // (see lib/nativeViewCover.ts), so the popup appears over the page rather
  // than over a blank pane. The snapshot is taken first, then the view hides;
  // if the popup closes before the snapshot arrives, nothing is hidden.
  const [snapshot, setSnapshot] = useState<string | null>(null)
  useEffect(() => {
    // Also hides the native view whenever the tab has no url — the landing
    // page (shown by the JSX below in that case) needs the view out of the
    // way, same as goHome() relies on this effect rather than calling
    // setVisible itself.
    if (!pageShown || !covered) {
      setSnapshot(null)
      window.api.browserViewSetVisible(browserId, pageShown)
      return
    }
    let cancelled = false
    const capture = window.api.browserViewCapture?.(browserId) ?? Promise.resolve(null)
    capture
      .catch(() => null)
      .then((dataUrl) => {
        if (cancelled) return
        setSnapshot(dataUrl)
        window.api.browserViewSetVisible(browserId, false)
      })
    return () => { cancelled = true }
  }, [browserId, pageShown, covered])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: Event) => {
      // Ignore clicks on the toggle button itself — it has its own onClick
      // handler to open/close the menu. Without this guard, the same click
      // that opens the menu can trigger this listener before the click event
      // finishes bubbling, causing the menu to immediately self-close.
      if (toggleButtonRef.current?.contains(e.target as Node)) return
      setMenuOpen(false)
    }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  function toggleMenu() {
    setMenuOpen((open) => !open)
  }

  useEffect(() => {
    if (!openDropdown) return
    const close = (e: Event) => {
      const target = e.target as Node
      if (deviceButtonRef.current?.contains(target) || clearButtonRef.current?.contains(target)) return
      setOpenDropdown(null)
    }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDropdown(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [openDropdown])

  // Handles both "still on the landing page" (creates the native view for
  // the first time) and "already browsing" (plain navigate) with the same
  // call site — used by the address bar and by clicking a landing-page row.
  function goTo(url: string) {
    if (!liveBrowserViews.has(browserId)) {
      liveBrowserViews.add(browserId)
      useBrowserStore.getState().updateTab(browserId, { url })
      window.api.browserViewCreate(browserId, url).then((webContentsId) => {
        // The mount effect's rAF loop seeds lastRectRef on its very first
        // frame — before this view exists — and the container's on-screen
        // rect typically doesn't change once the landing page is replaced,
        // so that loop alone would never push bounds again. Push them
        // explicitly now that the view actually exists in the main process,
        // and keep lastRectRef in sync so the loop doesn't immediately
        // re-push the same rect on its next tick.
        if (unmountedRef.current || webContentsId == null) return
        useBrowserStore.getState().updateTab(browserId, { webContentsId })
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            window.api.browserViewSetBounds(browserId, {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            })
            lastRectRef.current = rect
          }
        }
      })
    } else {
      window.api.browserViewNavigate(browserId, url)
    }
  }

  // Returns to the landing page without destroying the native view — it's
  // just detached from display (the visibility effect above reacts to `url`
  // going empty), so a later goTo() call finds it still in liveBrowserViews
  // and navigates it directly instead of re-creating it.
  function goHome() {
    useBrowserStore.getState().updateTab(browserId, {
      url: '',
      title: '',
      canGoBack: false,
      canGoForward: false,
      loadError: null,
      isLoading: false,
    })
    setUrlDraft('')
  }

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = normalizeUrlInput(urlDraft)
    if (!url) return
    goTo(url)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const isFavorite = useBrowserFavoritesStore((s) => (url ? s.isFavorite(url) : false))
  const isLoading = tabState?.isLoading ?? false
  const canGoBack = tabState?.canGoBack ?? false
  const canGoForward = tabState?.canGoForward ?? false
  const zoomPercent = zoomLevelToPercent(tabState?.zoomLevel ?? 0)
  const mobileMode = tabState?.mobileMode ?? false
  const mobileDevice = getMobileDevice(tabState?.mobileDeviceId)
  const isFullscreen = useBrowserStore((s) => s.fullscreenId === browserId)

  useEffect(() => {
    if (!isFullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useBrowserStore.getState().exitFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen])

  useEffect(() => {
    if (findOpen) {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    }
  }, [findOpen])

  function openFind() {
    if (!url) return
    setFindOpen(true)
    findInputRef.current?.focus()
    findInputRef.current?.select()
  }

  function closeFind() {
    setFindOpen(false)
    setFindResult(null)
    window.api.browserViewStopFind(browserId)
  }

  function handleFindChange(text: string) {
    setFindText(text)
    if (!text) {
      setFindResult(null)
      // Keep focus in the find box: the user is still typing in it.
      window.api.browserViewStopFind(browserId, false)
      return
    }
    window.api.browserViewFind(browserId, text)
  }

  function findStep(forward: boolean) {
    if (!findText) return
    window.api.browserViewFind(browserId, findText, { forward, findNext: true })
  }

  // null = Desktop (mobile view off); a device id turns mobile view on as that device.
  function selectDevice(deviceId: string | null) {
    setOpenDropdown(null)
    if (deviceId === null) {
      if (!mobileMode) return
      useBrowserStore.getState().updateTab(browserId, { mobileMode: false })
      window.api.browserViewSetMobileMode(browserId, false, undefined)
      return
    }
    useBrowserStore.getState().updateTab(browserId, { mobileMode: true, mobileDeviceId: deviceId })
    window.api.browserViewSetMobileMode(browserId, true, getMobileDevice(deviceId))
  }

  async function clearOne(kind: 'cache' | 'cookies' | 'history') {
    setOpenDropdown(null)
    if (kind === 'cache') await window.api.browserViewClearCache(browserId)
    if (kind === 'cookies') await window.api.browserViewClearCookies(browserId)
    if (kind === 'history') {
      useBrowserRecentStore.getState().clear()
      useBrowserClosedTabsStore.getState().clear()
    }
    useStatusMessageStore.getState().show(`Cleared ${kind}`)
  }

  useEffect(() => {
    if (!editingRef.current) setUrlDraft(url)
  }, [url])

  return (
    <div
      className="h-full w-full flex flex-col bg-bg overflow-hidden"
      // Focus in the toolbar/find box is DOM focus, so Cmd/Ctrl+F is seen here;
      // focus inside the page itself is handled in the main process instead.
      onKeyDown={(e) => {
        if ((isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          openFind()
        }
      }}
    >
      {!isFullscreen && (
      <>
      <div className="flex items-center gap-1 px-2 h-9 border-b border-border shrink-0 bg-tab-bar">
        <button
          type="button"
          aria-label="Home"
          disabled={!url}
          onClick={goHome}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
        >
          <HomeIcon />
        </button>
        <button
          type="button"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={() => window.api.browserViewGoBack(browserId)}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
        >
          <NavArrowIcon direction="back" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={() => window.api.browserViewGoForward(browserId)}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
        >
          <NavArrowIcon direction="forward" />
        </button>
        <button
          type="button"
          aria-label="Reload"
          onClick={() => window.api.browserViewReload(browserId)}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5"
        >
          <ReloadIcon spinning={isLoading} />
        </button>
        <form onSubmit={handleUrlSubmit} className="flex-1 min-w-0">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onFocus={() => { editingRef.current = true }}
            onBlur={() => { editingRef.current = false; setUrlDraft(url) }}
            spellCheck={false}
            placeholder="Search or enter address"
            className="w-full h-6 rounded bg-bg border border-border px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
          />
        </form>
        {url && (
          <button
            type="button"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorite}
            onClick={() => useBrowserFavoritesStore.getState().toggleFavorite(url, tabState?.title || url)}
            className={
              isFavorite
                ? 'flex h-6 w-6 items-center justify-center rounded text-accent hover:bg-white/5'
                : 'flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5'
            }
          >
            <StarIcon filled={isFavorite} />
          </button>
        )}
        <button
          ref={toggleButtonRef}
          type="button"
          aria-label="Zoom controls"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5"
        >
          <MoreVerticalIcon />
        </button>
      </div>

      {(menuOpen || findOpen) && (
        <div
          ref={menuRef}
          className="flex items-center justify-between gap-2.5 border-b border-border bg-tab-bar px-2 py-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left: view preferences (device, zoom, fullscreen). */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex items-center">
              <div className="flex items-center rounded-full border border-border bg-bg">
                <button
                  ref={deviceButtonRef}
                  type="button"
                  aria-label="Device"
                  aria-haspopup="menu"
                  aria-expanded={openDropdown === 'device'}
                  title="Device"
                  onClick={() => setOpenDropdown((open) => (open === 'device' ? null : 'device'))}
                  className={
                    mobileMode
                      ? 'flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs text-accent hover:bg-white/5'
                      : 'flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs text-fg-muted hover:text-fg hover:bg-white/5'
                  }
                >
                  {mobileMode ? <MobileIcon /> : <DesktopIcon />}
                  <span className="max-w-[8rem] truncate">{mobileMode ? mobileDevice.label : 'Desktop'}</span>
                  <CaretIcon />
                </button>
              </div>
              {openDropdown === 'device' && (
                <div
                  role="menu"
                  className="absolute left-0 top-7 z-10 min-w-max overflow-hidden rounded border border-border bg-bg p-1 shadow-lg"
                >
                  <DropdownItem checked={!mobileMode} onClick={() => selectDevice(null)}>
                    Desktop
                  </DropdownItem>
                  {MOBILE_DEVICES.map((d) => (
                    <DropdownItem
                      key={d.id}
                      checked={mobileMode && mobileDevice.id === d.id}
                      hint={`${d.width}px`}
                      onClick={() => selectDevice(d.id)}
                    >
                      {d.label}
                    </DropdownItem>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center rounded-full border border-border bg-bg overflow-hidden">
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => window.api.browserViewZoomOut(browserId)}
                className="flex h-6 w-7 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5"
              >
                <MinusIcon />
              </button>
              <button
                type="button"
                aria-label="Reset zoom"
                title="Reset zoom"
                onClick={() => window.api.browserViewZoomReset(browserId)}
                className="h-6 min-w-[3.25rem] border-x border-border px-1 text-xs tabular-nums text-fg-muted hover:text-fg hover:bg-white/5"
              >
                {zoomPercent}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => window.api.browserViewZoomIn(browserId)}
                className="flex h-6 w-7 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5"
              >
                <PlusIcon />
              </button>
            </div>
            <div className="flex items-center rounded-full border border-border bg-bg overflow-hidden">
              <button
                type="button"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                aria-pressed={isFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={() => useBrowserStore.getState().toggleFullscreen(browserId)}
                className={
                  isFullscreen
                    ? 'flex h-6 w-7 items-center justify-center bg-accent/15 text-accent'
                    : 'flex h-6 w-7 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5'
                }
              >
                <FullscreenIcon active={isFullscreen} />
              </button>
            </div>
          </div>

          {/* Right: page functions (find, clear data). Find sits on the inner
              edge so it grows leftwards into the gap when it opens. */}
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <div
              className={
                findOpen
                  ? 'flex h-6 min-w-0 flex-[0_1_19rem] items-center rounded-full border border-border bg-bg'
                  : 'flex h-6 items-center rounded-full border border-border bg-bg'
              }
            >
              <button
                type="button"
                aria-label="Find in page"
                aria-expanded={findOpen}
                title="Find in page"
                disabled={!url}
                onClick={() => (findOpen ? closeFind() : openFind())}
                className={
                  findOpen
                    ? 'flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-accent hover:bg-white/5'
                    : 'flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent'
                }
              >
                <SearchIcon />
              </button>
              {findOpen && (
                <>
                  <input
                    ref={findInputRef}
                    type="text"
                    aria-label="Find text"
                    placeholder="Find in page"
                    spellCheck={false}
                    value={findText}
                    onChange={(e) => handleFindChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        findStep(!e.shiftKey)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        closeFind()
                      }
                    }}
                    className="h-6 min-w-[3rem] flex-1 bg-transparent px-0.5 text-xs text-fg placeholder:text-fg-subtle outline-none"
                  />
                  <span className="shrink-0 whitespace-nowrap pr-1 text-[11px] tabular-nums text-fg-muted">
                    {findText && findResult ? (findResult.total === 0 ? 'No results' : `${findResult.active} of ${findResult.total}`) : ''}
                  </span>
                  <button
                    type="button"
                    aria-label="Previous match"
                    title="Previous match (Shift+Enter)"
                    disabled={!findText}
                    onClick={() => findStep(false)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronIcon direction="up" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next match"
                    title="Next match (Enter)"
                    disabled={!findText}
                    onClick={() => findStep(true)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronIcon direction="down" />
                  </button>
                  <button
                    type="button"
                    aria-label="Close find"
                    title="Close (Esc)"
                    onClick={closeFind}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-r-full text-fg-muted hover:text-fg hover:bg-white/5"
                  >
                    <CloseIcon />
                  </button>
                </>
              )}
            </div>
            <div className="relative flex items-center">
              <div className="flex items-center rounded-full border border-border bg-bg">
                <button
                  ref={clearButtonRef}
                  type="button"
                  aria-label="Clear browsing data"
                  aria-haspopup="menu"
                  aria-expanded={openDropdown === 'clear'}
                  title="Clear browsing data"
                  onClick={() => setOpenDropdown((open) => (open === 'clear' ? null : 'clear'))}
                  className="flex h-6 items-center gap-1 rounded-full px-2 text-fg-muted hover:text-fg hover:bg-white/5"
                >
                  <TrashIcon />
                  <CaretIcon />
                </button>
              </div>
              {openDropdown === 'clear' && (
                <div
                  role="menu"
                  className="absolute right-0 top-7 z-10 min-w-max overflow-hidden rounded border border-border bg-bg p-1 shadow-lg"
                >
                  <DropdownItem onClick={() => clearOne('cache')}>Clear cache</DropdownItem>
                  <DropdownItem onClick={() => clearOne('cookies')}>Clear cookies</DropdownItem>
                  <DropdownItem onClick={() => clearOne('history')}>Clear history</DropdownItem>
                  <div className="mx-0.5 my-1 h-px bg-border" />
                  <DropdownItem
                    onClick={() => {
                      setOpenDropdown(null)
                      setClearDataOpen(true)
                    }}
                  >
                    Choose what to clear…
                  </DropdownItem>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" />
        {snapshot && (
          <img
            data-browser-snapshot=""
            src={snapshot}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          />
        )}
        {!url && !loadError && <BrowserLandingPage onNavigate={goTo} />}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg px-4 text-center">
            <p className="text-sm text-fg-muted">This page couldn't load</p>
            <p className="max-w-sm text-xs text-fg-subtle">{loadError}</p>
            <button
              type="button"
              onClick={() => window.api.browserViewReload(browserId)}
              className="mt-1 rounded border border-border px-2 py-1 text-xs text-fg-muted hover:text-fg hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}
      </div>
      {clearDataOpen && (
        <ClearBrowsingDataModal browserId={browserId} onClose={() => setClearDataOpen(false)} />
      )}
    </div>
  )
}

function NavArrowIcon({ direction }: { direction: 'back' | 'forward' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {direction === 'back' ? (
        <path d="M15 19L8 12L15 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      ) : (
        <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 11.5L12 4l9 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ReloadIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={spinning ? 'animate-spin' : ''}
    >
      {/* Mirrored (vs. a naive "arc + hook" reload glyph) so the arrowhead
          implies clockwise motion, matching animate-spin's fixed clockwise
          rotation — drawn counterclockwise, it visibly spun backwards
          against its own arrowhead while loading. */}
      <path d="M21 12a9 9 0 1 1-3-6.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 4v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function MobileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
      <line x1="11" y1="18" x2="13" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function DropdownItem({
  checked,
  hint,
  onClick,
  children,
}: {
  checked?: boolean
  hint?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-white/5 hover:text-fg"
    >
      {checked !== undefined && <span className="w-3 shrink-0 text-center text-accent">{checked ? '✓' : ''}</span>}
      <span>{children}</span>
      {hint && <span className="ml-auto pl-4 tabular-nums text-fg-subtle">{hint}</span>}
    </button>
  )
}

function DesktopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CaretIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
      <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7h16M10 7V4.5h4V7M6.5 7l.9 12.5a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M10.5 11v5.5M13.5 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function MoreVerticalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="5" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="19" r="1.8" fill="currentColor" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function FullscreenIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 3v3a2 2 0 0 1-2 2H4M15 3v3a2 2 0 0 0 2 2h3M9 21v-3a2 2 0 0 0-2-2H4M15 21v-3a2 2 0 0 1 2-2h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
