import { BrowserWindow, WebContentsView, ipcMain, session } from 'electron'

// Guest pages share this dedicated partition with each other (so cookies/logins
// persist across browser tabs like normal browser tabs would) but NOT with the
// main window's own session. Without this, WebContentsView shares Electron's
// default session with the main window, and Chromium's zoom level is scoped to
// the session rather than the individual webContents — so zooming a guest page
// silently zoomed the entire app UI (sidebar, tabs, everything) in lockstep.
// Created lazily (not at module load) because session.fromPartition requires
// the app to be ready.
function getBrowserSession(): Electron.Session {
  return session.fromPartition('persist:browser-tabs')
}

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

interface DeviceSize {
  width: number
  height: number
  pixelRatio: number
}

export type BrowserViewEvent =
  | { type: 'did-start-loading' }
  | { type: 'did-stop-loading'; canGoBack: boolean; canGoForward: boolean }
  | { type: 'did-navigate'; url: string; canGoBack: boolean; canGoForward: boolean }
  | { type: 'did-navigate-in-page'; url: string; canGoBack: boolean; canGoForward: boolean }
  | { type: 'page-title-updated'; title: string }
  | { type: 'did-fail-load'; errorDescription: string }
  | { type: 'dom-ready'; webContentsId: number }
  | { type: 'zoom-changed'; level: number }
  | { type: 'open-in-new-tab'; url: string }

interface Entry {
  view: WebContentsView
  attached: boolean
  mobileMode: boolean
  consoleLogs: string[]
}

// Reserved browser-view id for the single tab the vide-browser MCP server
// (VIDE-53) drives on Claude's behalf — never one of the user's own tabs,
// which are addressed by the path-like ids buildBrowserPath generates.
const CLAUDE_TAB_ID = 'claude-controlled'
const MAX_CONSOLE_LOGS = 200
const CONSOLE_LEVELS = ['verbose', 'info', 'warning', 'error'] as const

// <webview> was dropped in favor of WebContentsView because Electron's <webview>
// guest never syncs its own window.innerHeight/vh-based layout past the intrinsic
// 300x150 default — confirmed via isolated repro, not fixable from the outside.
// WebContentsView reports its real bounds to the guest correctly, at the cost of
// needing its pixel bounds pushed from the renderer on every resize/pane-move
// instead of it just living in the DOM flex layout.
export class BrowserViewManager {
  private viewsByWindow = new Map<number, Map<string, Entry>>()

  registerHandlers(): void {
    ipcMain.handle('browserView:create', (event, id: string, url: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return win ? this.create(win, id, url) : null
    })
    ipcMain.handle('browserView:setBounds', (event, id: string, bounds: Bounds) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.setBounds(win.id, id, bounds)
    })
    ipcMain.handle('browserView:setVisible', (event, id: string, visible: boolean) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.setVisible(win, id, visible)
    })
    ipcMain.handle('browserView:navigate', (event, id: string, url: string) =>
      this.get(this.winIdOf(event), id)?.webContents.loadURL(url)
    )
    ipcMain.handle('browserView:goBack', (event, id: string) =>
      this.get(this.winIdOf(event), id)?.webContents.navigationHistory.goBack()
    )
    ipcMain.handle('browserView:goForward', (event, id: string) =>
      this.get(this.winIdOf(event), id)?.webContents.navigationHistory.goForward()
    )
    ipcMain.handle('browserView:reload', (event, id: string) =>
      this.get(this.winIdOf(event), id)?.webContents.reload()
    )
    ipcMain.handle('browserView:zoomIn', (event, id: string) => {
      const winId = this.winIdOf(event)
      this.setZoom(winId, id, (this.get(winId, id)?.webContents.getZoomLevel() ?? 0) + 1)
    })
    ipcMain.handle('browserView:zoomOut', (event, id: string) => {
      const winId = this.winIdOf(event)
      this.setZoom(winId, id, (this.get(winId, id)?.webContents.getZoomLevel() ?? 0) - 1)
    })
    ipcMain.handle('browserView:zoomReset', (event, id: string) => this.setZoom(this.winIdOf(event), id, 0))
    ipcMain.handle('browserView:setMobileMode', (event, id: string, enabled: boolean, device?: DeviceSize) =>
      this.setMobileMode(this.winIdOf(event), id, enabled, device)
    )
    ipcMain.handle('browserView:clearCache', async (event, id: string) => {
      // The HTTP cache belongs to the shared 'persist:browser-tabs' session, not any
      // one webContents, so this clears it for every browser tab — only the requesting
      // tab gets reloaded to reflect it immediately.
      await getBrowserSession().clearCache()
      this.get(this.winIdOf(event), id)?.webContents.reload()
    })
    ipcMain.handle('browserView:destroy', (event, id: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.destroy(win, id)
    })
  }

  private winIdOf(event: Electron.IpcMainInvokeEvent): number {
    return BrowserWindow.fromWebContents(event.sender)?.id ?? -1
  }

  private entriesFor(winId: number): Map<string, Entry> {
    let entries = this.viewsByWindow.get(winId)
    if (!entries) {
      entries = new Map()
      this.viewsByWindow.set(winId, entries)
    }
    return entries
  }

  private get(winId: number, id: string): WebContentsView | undefined {
    return this.viewsByWindow.get(winId)?.get(id)?.view
  }

  private create(win: BrowserWindow, id: string, url: string): number | null {
    const entries = this.entriesFor(win.id)
    const existing = entries.get(id)
    if (existing) return existing.view.webContents.id

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: getBrowserSession(),
      },
    })
    view.setBackgroundColor('#1e1e1e')
    view.webContents.loadURL(url)
    this.wireEvents(win, id, view)

    win.contentView.addChildView(view)
    entries.set(id, { view, attached: true, mobileMode: false, consoleLogs: [] })
    return view.webContents.id
  }

  private sendEvent(win: BrowserWindow, id: string, payload: BrowserViewEvent): void {
    if (!win.isDestroyed()) win.webContents.send('browserView:event', id, payload)
  }

  private wireEvents(win: BrowserWindow, id: string, view: WebContentsView): void {
    const wc = view.webContents

    // Links/scripts that would normally pop a real OS window (target="_blank",
    // window.open, ctrl/cmd-click) get deny'd here — WebContentsView has no
    // window of its own to pop one into anyway — and handed to the renderer
    // instead, which opens it as a new browser tab in the app's own tab strip.
    wc.setWindowOpenHandler((details) => {
      this.sendEvent(win, id, { type: 'open-in-new-tab', url: details.url })
      return { action: 'deny' }
    })

    wc.on('did-start-loading', () => this.sendEvent(win, id, { type: 'did-start-loading' }))
    wc.on('did-stop-loading', () =>
      this.sendEvent(win, id, {
        type: 'did-stop-loading',
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    )
    wc.on('did-navigate', (_e, url) =>
      this.sendEvent(win, id, {
        type: 'did-navigate',
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    )
    wc.on('did-navigate-in-page', (_e, url) =>
      this.sendEvent(win, id, {
        type: 'did-navigate-in-page',
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    )
    wc.on('page-title-updated', (_e, title) => this.sendEvent(win, id, { type: 'page-title-updated', title }))
    // Buffered per-view rather than forwarded live — only the Claude tab's
    // buffer actually gets read (via getClaudeTabConsoleLogs), but wiring it
    // for every view uniformly is simpler than a separate code path just for
    // that one id.
    wc.on('console-message', (_e, level, message) => {
      const entry = this.viewsByWindow.get(win.id)?.get(id)
      if (!entry) return
      entry.consoleLogs.push(`[${CONSOLE_LEVELS[level] ?? level}] ${message}`)
      if (entry.consoleLogs.length > MAX_CONSOLE_LOGS) entry.consoleLogs.shift()
    })
    wc.on('did-fail-load', (_e, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
      // -3 is ERR_ABORTED, fired on normal navigation interruption (e.g. redirects) — not a real failure
      if (!isMainFrame || errorCode === -3) return
      this.sendEvent(win, id, { type: 'did-fail-load', errorDescription })
    })
    wc.on('dom-ready', () => {
      this.sendEvent(win, id, { type: 'dom-ready', webContentsId: wc.id })
      this.sendEvent(win, id, { type: 'zoom-changed', level: wc.getZoomLevel() })
      // Trackpad pinch and Ctrl+scroll are delivered to the guest page as a
      // ctrlKey wheel event. Real browsers preventDefault() it to drive their own
      // page zoom, which also happens to be what stops macOS's system-wide
      // Accessibility Zoom from treating the same gesture as a request to
      // magnify the whole screen. The arbitrary content loaded here won't do
      // that itself, so do it on its behalf.
      wc.executeJavaScript(
        `window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault() }, { passive: false, capture: true })`
      ).catch(() => {})
    })

    // Unshifted CmdOrCtrl+=/-/0 zoom just this guest — same "unshifted = scoped to
    // the focused thing" split the editor/terminal use, extended to embedded pages.
    // Shares setZoom() with the browserView:zoomIn/zoomOut/zoomReset IPC handlers
    // (used by the browser tab's own "..." menu) so both paths apply the exact
    // same clamp and always agree on the current level.
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.shift || input.alt) return
      if (!input.meta && !input.control) return

      if (input.key === '=' || input.key === '+') {
        event.preventDefault()
        this.setZoom(win.id, id, wc.getZoomLevel() + 1)
      } else if (input.key === '-' || input.key === '_') {
        event.preventDefault()
        this.setZoom(win.id, id, wc.getZoomLevel() - 1)
      } else if (input.key === '0') {
        event.preventDefault()
        this.setZoom(win.id, id, 0)
      }
    })
  }

  private setZoom(winId: number, id: string, level: number): void {
    const wc = this.get(winId, id)?.webContents
    if (!wc) return
    const clamped = Math.max(-8, Math.min(9, level))
    wc.setZoomLevel(clamped)
    const win = BrowserWindow.fromId(winId)
    if (win) this.sendEvent(win, id, { type: 'zoom-changed', level: clamped })
  }

  private setMobileMode(winId: number, id: string, enabled: boolean, device?: DeviceSize): void {
    const entry = this.viewsByWindow.get(winId)?.get(id)
    if (!entry) return
    entry.mobileMode = enabled
    const wc = entry.view.webContents
    wc.setUserAgent(enabled ? MOBILE_USER_AGENT : '')
    if (enabled && device) {
      // Overrides what the page's own layout/media-queries see (window.innerWidth,
      // devicePixelRatio) to match a real device — independent of the WebContentsView's
      // actual on-screen bounds, which the renderer sizes/centers separately via
      // setBounds so the guest visually reads as a phone-sized frame, not a full-width
      // desktop page pretending to be mobile.
      wc.enableDeviceEmulation({
        screenPosition: 'mobile',
        screenSize: { width: device.width, height: device.height },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: device.pixelRatio,
        viewSize: { width: device.width, height: device.height },
        scale: 1,
      })
    } else {
      wc.disableDeviceEmulation()
    }
    wc.reload()
  }

  private setBounds(winId: number, id: string, bounds: Bounds): void {
    this.get(winId, id)?.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    })
  }

  private setVisible(win: BrowserWindow, id: string, visible: boolean): void {
    const entry = this.viewsByWindow.get(win.id)?.get(id)
    if (!entry) return
    if (visible && !entry.attached) {
      win.contentView.addChildView(entry.view)
      entry.attached = true
    } else if (!visible && entry.attached) {
      win.contentView.removeChildView(entry.view)
      entry.attached = false
    }
  }

  private destroy(win: BrowserWindow, id: string): void {
    const entry = this.viewsByWindow.get(win.id)?.get(id)
    if (!entry) return
    if (entry.attached) win.contentView.removeChildView(entry.view)
    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close({ waitForBeforeUnload: false })
    }
    this.viewsByWindow.get(win.id)?.delete(id)
  }

  // --- Claude-controlled tab (VIDE-53) ---
  //
  // Called directly from BrowserBridge inside this same main process (not
  // over IPC — there's no renderer involved in driving this tab), on behalf
  // of the vide-browser MCP server. One tab per vIDE window, at the reserved
  // CLAUDE_TAB_ID, separate from anything the user has open manually — but
  // (unlike two earlier attempts, both of which broke live: a WebContentsView
  // covering the whole app, then one positioned off-screen that broke
  // capturePage) a REAL, visible tab using the exact same WebContentsView +
  // create() path every user-opened browser tab already uses, so it's sized
  // correctly and definitely has a working compositor surface. The one
  // difference from a user tab: on first creation this also tells the
  // renderer to actually open/focus it in the tab strip (browser:open-claude
  // -tab), since there's no user click driving that here.

  async navigateClaudeTab(winId: number, url: string): Promise<void> {
    const win = BrowserWindow.fromId(winId)
    if (!win || win.isDestroyed()) throw new Error(`vIDE window ${winId} not found`)

    const isFirstUse = !this.get(winId, CLAUDE_TAB_ID)
    if (isFirstUse) {
      this.create(win, CLAUDE_TAB_ID, url) // create() already loads `url` on first creation
      win.webContents.send('browser:open-claude-tab')
    } else {
      await this.claudeTabWebContents(winId).loadURL(url)
    }
  }

  private claudeTabWebContents(winId: number): Electron.WebContents {
    const wc = this.get(winId, CLAUDE_TAB_ID)?.webContents
    if (!wc) throw new Error('No Claude-controlled tab open for this window yet — call navigate first')
    return wc
  }

  // Diagnostic fields (imageSize/viewBounds, activeElementAfterClick) exist
  // because a live test reported click+type as tool-level "success" with no
  // effect. They paid off: confirmed live that capturePage()'s image comes
  // back at the display's device pixel resolution (2906x2344), exactly 2x
  // the view's own logical bounds (1453x1172, from getBounds() below) —
  // getSize() with no scaleFactor arg returns that SAME device-pixel size,
  // not logical/CSS pixels as first assumed, so the earlier
  // `image.resize(image.getSize())` was resizing an image to its own
  // current size — a total no-op. Resizing to the view's actual bounds is
  // what's needed to make the exported PNG's pixel dimensions match 1:1
  // with what sendInputEvent's x/y coordinates expect.
  async captureClaudeTab(winId: number): Promise<{ png: Buffer; imageSize: { width: number; height: number }; viewBounds: { width: number; height: number } }> {
    const image = await this.claudeTabWebContents(winId).capturePage()
    const view = this.get(winId, CLAUDE_TAB_ID)
    const bounds = view ? view.getBounds() : { width: 0, height: 0 }
    const viewBounds = { width: bounds.width, height: bounds.height }
    const normalized = viewBounds.width > 0 && viewBounds.height > 0 ? image.resize(viewBounds) : image
    const png = normalized.toPNG()
    return { png, imageSize: normalized.getSize(), viewBounds }
  }

  async clickClaudeTab(winId: number, x: number, y: number): Promise<string> {
    const wc = this.claudeTabWebContents(winId)
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    // sendInputEvent's own effects (including a resulting focus change) are
    // processed asynchronously in the renderer's input pipeline — querying
    // document.activeElement in the very same tick can race ahead of that.
    // Observed live: every click reported "nothing (document.body)"
    // focused regardless of where it landed, including an attempt a
    // subsequent browser_type call proved HAD actually focused something.
    // A short delay lets the click's own effects land first.
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      return await wc.executeJavaScript(`(() => {
        const el = document.activeElement
        if (!el || el === document.body) return 'nothing (document.body)'
        let desc = el.tagName
        if (el.id) desc += '#' + el.id
        const type = el.getAttribute && el.getAttribute('type')
        if (type) desc += '[type=' + type + ']'
        return desc
      })()`)
    } catch (err) {
      return `could not inspect: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  async typeIntoClaudeTab(winId: number, text: string): Promise<void> {
    return this.claudeTabWebContents(winId).insertText(text)
  }

  getClaudeTabConsoleLogs(winId: number): string[] {
    return this.viewsByWindow.get(winId)?.get(CLAUDE_TAB_ID)?.consoleLogs ?? []
  }

  async readClaudeTabText(winId: number): Promise<string> {
    return this.claudeTabWebContents(winId).executeJavaScript('document.body.innerText')
  }

  disposeWindow(winId: number): void {
    const entries = this.viewsByWindow.get(winId)
    if (entries) {
      const win = BrowserWindow.fromId(winId)
      for (const [, entry] of entries) {
        if (win && entry.attached) win.contentView.removeChildView(entry.view)
        if (!entry.view.webContents.isDestroyed()) {
          entry.view.webContents.close({ waitForBeforeUnload: false })
        }
      }
    }
    this.viewsByWindow.delete(winId)
  }
}
