import { useEffect, useRef, useState } from 'react'
import { useBrowserStore } from '@/stores/browserStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildBrowserPath } from '@/components/Settings/paths'
import { normalizeUrlInput } from './urlBar'
import { zoomLevelToPercent } from './zoomLevel'
import { MOBILE_DEVICES, getMobileDevice } from './mobileDevices'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { useSearchStore } from '@/stores/searchStore'
import { useChangelogStore } from '@/stores/changelogStore'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { BrowserLandingPage } from './BrowserLandingPage'

interface Props {
  browserId: string
}

// Module-level set tracks which browser ids already have a live WebContentsView
// in the main process, so remounts (pane moves, tab switches) reattach/show
// instead of recreating and losing navigation/session state — same pattern
// TerminalTab.tsx uses for PTYs, adapted for a main-process-owned view instead
// of a DOM node.
const liveBrowserViews = new Set<string>()

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
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const deviceButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    unmountedRef.current = false

    useBrowserStore.getState().ensureTab(browserId, '')

    let cancelled = false
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
          useBrowserRecentStore.getState().recordVisit(event.url, event.url)
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
          if (currentUrl) useBrowserRecentStore.getState().recordVisit(currentUrl, event.title)
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
        case 'open-in-new-tab': {
          const newId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
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
      s.searchOpen ||
      s.actionPaletteOpen ||
      s.shortcutsOverlayOpen ||
      s.recentProjectsPaletteOpen ||
      s.branchPaletteOpen
  )
  const changelogOpen = useChangelogStore((s) => s.content !== null)
  useEffect(() => {
    window.api.browserViewSetVisible(browserId, !loadError && !anyOverlayOpen && !changelogOpen)
  }, [browserId, loadError, anyOverlayOpen, changelogOpen])

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
    if (!deviceMenuOpen) return
    const close = (e: Event) => {
      if (deviceButtonRef.current?.contains(e.target as Node)) return
      setDeviceMenuOpen(false)
    }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeviceMenuOpen(false) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [deviceMenuOpen])

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

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = normalizeUrlInput(urlDraft)
    if (!url) return
    goTo(url)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const url = tabState?.url ?? ''
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

  function toggleMobileMode() {
    const next = !mobileMode
    useBrowserStore.getState().updateTab(browserId, { mobileMode: next })
    window.api.browserViewSetMobileMode(browserId, next, next ? mobileDevice : undefined)
  }

  function handleDeviceChange(deviceId: string) {
    const device = getMobileDevice(deviceId)
    useBrowserStore.getState().updateTab(browserId, { mobileDeviceId: deviceId })
    if (mobileMode) window.api.browserViewSetMobileMode(browserId, true, device)
  }

  useEffect(() => {
    if (!editingRef.current) setUrlDraft(url)
  }, [url])

  return (
    <div className="h-full w-full flex flex-col bg-bg overflow-hidden">
      {!isFullscreen && (
      <>
      <div className="flex items-center gap-1 px-2 h-9 border-b border-border shrink-0 bg-tab-bar">
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

      {menuOpen && (
        <div
          ref={menuRef}
          className="flex items-center justify-between gap-1.5 border-b border-border bg-tab-bar px-2 py-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center rounded-full border border-border bg-bg overflow-hidden">
            <button
              type="button"
              onClick={async () => {
                await window.api.browserViewClearCache(browserId)
                useStatusMessageStore.getState().show('Cache cleared')
              }}
              className="flex h-6 items-center justify-center whitespace-nowrap px-3 text-xs text-fg-muted hover:text-fg hover:bg-white/5"
            >
              Clear cache
            </button>
          </div>
          <div className="flex items-center gap-1.5">
          <div className="relative flex items-center">
            <div className="flex items-center rounded-full border border-border bg-bg overflow-hidden">
              <button
                ref={deviceButtonRef}
                type="button"
                aria-label="Mobile device"
                aria-expanded={deviceMenuOpen}
                onClick={() => setDeviceMenuOpen((open) => !open)}
                className={
                  mobileMode
                    ? 'h-6 whitespace-nowrap border-r border-border bg-bg px-2 text-xs text-fg-muted hover:text-fg'
                    : 'h-6 whitespace-nowrap border-r border-border bg-bg px-2 text-xs text-fg-subtle hover:text-fg-muted'
                }
              >
                {mobileDevice.label}
              </button>
              <button
                type="button"
                aria-label="Toggle mobile view"
                aria-pressed={mobileMode}
                title="Toggle mobile view"
                onClick={toggleMobileMode}
                className={
                  mobileMode
                    ? 'flex h-6 w-7 items-center justify-center bg-accent/15 text-accent'
                    : 'flex h-6 w-7 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5'
                }
              >
                <MobileIcon />
              </button>
            </div>
            {deviceMenuOpen && (
              <div className="absolute right-0 top-7 z-10 min-w-max overflow-hidden rounded border border-border bg-bg shadow-lg">
                {MOBILE_DEVICES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      handleDeviceChange(d.id)
                      setDeviceMenuOpen(false)
                    }}
                    className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-white/5 hover:text-fg"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center rounded-full border border-border bg-bg overflow-hidden">
            <button
              type="button"
              aria-label="Zoom out"
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
        </div>
      )}
      </>
      )}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" />
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
      <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 4v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
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
