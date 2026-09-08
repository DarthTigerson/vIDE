import { BrowserWindow, WebContentsView, ipcMain, session } from 'electron'
import { X509Certificate } from 'crypto'

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

export interface NetworkLogEntry {
  requestId: string
  url: string
  method: string
  status: number
  type: string
  startedAt: number
}

export interface CertInfo {
  subject: string
  issuer: string
  validFrom: string
  validTo: string
  isExpired: boolean
  daysUntilExpiry: number
  fingerprint256: string
}

interface AXNode {
  nodeId: string
  ignored?: boolean
  role?: { value: string }
  name?: { value: string }
  value?: { value: string }
  childIds?: string[]
  parentId?: string
}

function formatAccessibilityTree(nodes: AXNode[]): string {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const root = nodes.find((n) => !n.parentId || !byId.has(n.parentId))
  if (!root) return '(empty tree)'

  const lines: string[] = []
  function visit(node: AXNode, depth: number): void {
    if (node.ignored) return
    const role = node.role?.value ?? ''
    const isStructural = !role || role === 'none' || role === 'presentation' || role === 'generic'
    if (!isStructural) {
      const name = node.name?.value ? ` "${node.name.value}"` : ''
      const val = node.value?.value ? ` = "${node.value.value}"` : ''
      lines.push('  '.repeat(depth) + role + name + val)
    }
    const nextDepth = isStructural ? depth : depth + 1
    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId)
      if (child) visit(child, nextDepth)
    }
  }
  visit(root, 0)
  if (lines.length > 300) {
    lines.splice(300)
    lines.push('... (truncated — use browser_find_element or browser_get_html for deeper inspection)')
  }
  return lines.join('\n')
}

interface Entry {
  view: WebContentsView
  attached: boolean
  mobileMode: boolean
  consoleLogs: string[]
  networkLog: NetworkLogEntry[]
}

// Reserved browser-view id for the single tab the vide-browser MCP server
// (VIDE-53) drives on Claude's behalf — never one of the user's own tabs,
// which are addressed by the path-like ids buildBrowserPath generates.
export const CLAUDE_TAB_ID = 'claude-controlled'
const MAX_CONSOLE_LOGS = 200
const MAX_NETWORK_LOG = 100
const CONSOLE_LEVELS = ['verbose', 'info', 'warning', 'error'] as const

// Maps common DOM key names to Electron accelerator-style key codes that
// sendInputEvent expects. Anything not in the map is passed through as-is.
const KEY_ALIASES: Record<string, string> = {
  Enter: 'Return',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
}
function normalizeKey(key: string): string {
  return KEY_ALIASES[key] ?? key
}

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
    entries.set(id, { view, attached: true, mobileMode: false, consoleLogs: [], networkLog: [] })
    if (id === CLAUDE_TAB_ID) this.attachNetworkDebugger(win.id, id, view.webContents)
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
      try { entry.view.webContents.debugger.detach() } catch { /* not attached */ }
      entry.view.webContents.close({ waitForBeforeUnload: false })
    }
    this.viewsByWindow.get(win.id)?.delete(id)
  }

  // Taps Chromium's Network domain (CDP) for the Claude tab so we can give
  // Claude a real network log without polling or page-side injection. The
  // debugger is per-webContents, so this only captures the Claude tab's
  // traffic — not the user's other browser tabs.
  private attachNetworkDebugger(winId: number, id: string, wc: Electron.WebContents): void {
    try {
      wc.debugger.attach('1.3')
    } catch {
      return
    }
    // Correlates request metadata (method, start time) with the later response
    // event, which only carries the requestId as a key.
    const pending = new Map<string, { url: string; method: string; startedAt: number }>()
    wc.debugger.sendCommand('Network.enable').catch(() => {})
    wc.debugger.on('message', (_event, method, params: Record<string, any>) => {
      if (method === 'Network.requestWillBeSent') {
        pending.set(params.requestId as string, {
          url: params.request.url as string,
          method: params.request.method as string,
          startedAt: Math.round((params.timestamp as number) * 1000),
        })
      } else if (method === 'Network.responseReceived') {
        const req = pending.get(params.requestId as string)
        if (!req) return
        pending.delete(params.requestId as string)
        const entry = this.viewsByWindow.get(winId)?.get(id)
        if (!entry) return
        entry.networkLog.push({
          requestId: params.requestId as string,
          url: req.url,
          method: req.method,
          status: (params.response as { status: number }).status,
          type: params.type as string,
          startedAt: req.startedAt,
        })
        if (entry.networkLog.length > MAX_NETWORK_LOG) entry.networkLog.shift()
      } else if (method === 'Network.loadingFailed') {
        pending.delete(params.requestId as string)
      }
    })
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

  private claudeTabWebContents(winId: number, tabId = CLAUDE_TAB_ID): Electron.WebContents {
    const wc = this.get(winId, tabId)?.webContents
    if (!wc) throw new Error(
      tabId === CLAUDE_TAB_ID
        ? 'No Claude-controlled tab open for this window yet — call browser_navigate first'
        : `Tab "${tabId}" not found — use browser_list_tabs to see open tabs`
    )
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
  async captureClaudeTab(winId: number, tabId = CLAUDE_TAB_ID): Promise<{ png: Buffer; imageSize: { width: number; height: number }; viewBounds: { width: number; height: number } }> {
    const image = await this.claudeTabWebContents(winId, tabId).capturePage()
    const view = this.get(winId, tabId)
    const bounds = view ? view.getBounds() : { width: 0, height: 0 }
    const viewBounds = { width: bounds.width, height: bounds.height }
    const normalized = viewBounds.width > 0 && viewBounds.height > 0 ? image.resize(viewBounds) : image
    const png = normalized.toPNG()
    return { png, imageSize: normalized.getSize(), viewBounds }
  }

  async clickClaudeTab(winId: number, x: number, y: number, tabId = CLAUDE_TAB_ID): Promise<string> {
    const wc = this.claudeTabWebContents(winId, tabId)
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

  async typeIntoClaudeTab(winId: number, text: string, tabId = CLAUDE_TAB_ID): Promise<void> {
    return this.claudeTabWebContents(winId, tabId).insertText(text)
  }

  getClaudeTabConsoleLogs(winId: number, tabId = CLAUDE_TAB_ID): string[] {
    return this.viewsByWindow.get(winId)?.get(tabId)?.consoleLogs ?? []
  }

  getClaudeTabUrl(winId: number, tabId = CLAUDE_TAB_ID): string {
    return this.claudeTabWebContents(winId, tabId).getURL()
  }

  async waitForClaudeTabLoad(winId: number, timeoutMs: number, tabId = CLAUDE_TAB_ID): Promise<void> {
    const wc = this.claudeTabWebContents(winId, tabId)
    if (!wc.isLoading()) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        wc.removeListener('did-stop-loading', onLoad)
        reject(new Error(`Page did not finish loading within ${timeoutMs}ms`))
      }, timeoutMs)
      function onLoad() {
        clearTimeout(timer)
        resolve()
      }
      wc.once('did-stop-loading', onLoad)
    })
  }

  async waitForSelectorInClaudeTab(winId: number, selector: string, timeoutMs: number, tabId = CLAUDE_TAB_ID): Promise<void> {
    const wc = this.claudeTabWebContents(winId, tabId)
    const start = Date.now()
    while (true) {
      const found: boolean = await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)
      if (found) return
      if (Date.now() - start >= timeoutMs) throw new Error(`Selector "${selector}" not found within ${timeoutMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  async findElementInClaudeTab(
    winId: number,
    selector?: string,
    text?: string,
    tabId = CLAUDE_TAB_ID
  ): Promise<{ x: number; y: number; tag: string; description: string }> {
    const wc = this.claudeTabWebContents(winId, tabId)
    if (selector) {
      return wc.executeJavaScript(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) throw new Error('Selector not found: ' + ${JSON.stringify(selector)})
        el.scrollIntoView({ behavior: 'instant', block: 'center' })
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) throw new Error('Element matched but has no size (hidden?): ' + ${JSON.stringify(selector)})
        const desc = (el.id ? el.tagName + '#' + el.id : el.tagName) + ': ' + (el.textContent?.trim().slice(0, 60) ?? '')
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: el.tagName, description: desc }
      })()`)
    } else if (text) {
      return wc.executeJavaScript(`(() => {
        const needle = ${JSON.stringify(text.toLowerCase())}
        const candidates = Array.from(document.querySelectorAll('a,button,input,label,select,textarea,[role="button"],[role="link"],[role="menuitem"],li,td,th,h1,h2,h3,h4,h5,h6,span,p'))
        const el = candidates.find(el => el.textContent?.trim().toLowerCase().includes(needle))
        if (!el) throw new Error('No visible element found containing text: ' + ${JSON.stringify(text)})
        el.scrollIntoView({ behavior: 'instant', block: 'center' })
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) throw new Error('Element found but not visible')
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: el.tagName, description: el.tagName + ': ' + (el.textContent?.trim().slice(0, 60) ?? '') }
      })()`)
    } else {
      throw new Error('Provide either selector or text')
    }
  }

  async scrollClaudeTab(winId: number, x: number, y: number, selector?: string, tabId = CLAUDE_TAB_ID): Promise<void> {
    const wc = this.claudeTabWebContents(winId, tabId)
    if (selector) {
      await wc.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Selector not found: ' + ${JSON.stringify(selector)}); el.scrollIntoView({ behavior: 'instant', block: 'center' }) })()`
      )
    } else {
      await wc.executeJavaScript(`window.scrollBy(${x}, ${y})`)
    }
  }

  async keyPressInClaudeTab(winId: number, key: string, tabId = CLAUDE_TAB_ID): Promise<void> {
    const wc = this.claudeTabWebContents(winId, tabId)
    const keyCode = normalizeKey(key)
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  async readClaudeTabText(winId: number, tabId = CLAUDE_TAB_ID): Promise<string> {
    return this.claudeTabWebContents(winId, tabId).executeJavaScript('document.body.innerText')
  }

  async readClaudeTabHtml(winId: number, tabId = CLAUDE_TAB_ID): Promise<string> {
    return this.claudeTabWebContents(winId, tabId).executeJavaScript('document.documentElement.outerHTML')
  }

  async evaluateInClaudeTab(winId: number, script: string, tabId = CLAUDE_TAB_ID): Promise<unknown> {
    return this.claudeTabWebContents(winId, tabId).executeJavaScript(script)
  }

  getClaudeTabNetworkLog(winId: number, tabId = CLAUDE_TAB_ID): NetworkLogEntry[] {
    return this.viewsByWindow.get(winId)?.get(tabId)?.networkLog ?? []
  }

  clearClaudeTabNetworkLog(winId: number, tabId = CLAUDE_TAB_ID): void {
    const entry = this.viewsByWindow.get(winId)?.get(tabId)
    if (entry) entry.networkLog = []
  }

  async getClaudeTabResponseBody(winId: number, urlMatch: string, tabId = CLAUDE_TAB_ID): Promise<{ body: string; base64Encoded: boolean }> {
    const log = this.getClaudeTabNetworkLog(winId, tabId)
    const entry = [...log].reverse().find((e) => e.url.includes(urlMatch))
    if (!entry) throw new Error(`No captured request matching "${urlMatch}" — check browser_get_network_log for available URLs`)
    const wc = this.claudeTabWebContents(winId, tabId)
    try {
      return (await wc.debugger.sendCommand('Network.getResponseBody', { requestId: entry.requestId })) as {
        body: string
        base64Encoded: boolean
      }
    } catch (err) {
      throw new Error(`Could not retrieve body for ${entry.url}: ${err instanceof Error ? err.message : String(err)} (cached responses and streams are not available)`)
    }
  }

  async getClaudeTabPdf(winId: number, tabId = CLAUDE_TAB_ID): Promise<Buffer> {
    return this.claudeTabWebContents(winId, tabId).printToPDF({ printBackground: true })
  }

  async getClaudeTabAccessibilityTree(winId: number, tabId = CLAUDE_TAB_ID): Promise<string> {
    const wc = this.claudeTabWebContents(winId, tabId)
    await wc.debugger.sendCommand('Accessibility.enable')
    const { nodes } = (await wc.debugger.sendCommand('Accessibility.getFullAXTree')) as { nodes: AXNode[] }
    return formatAccessibilityTree(nodes)
  }

  async checkClaudeTabCertificate(winId: number, tabId = CLAUDE_TAB_ID): Promise<CertInfo> {
    const wc = this.claudeTabWebContents(winId, tabId)
    const url = wc.getURL()
    if (!url.startsWith('https://')) throw new Error('Current page is not HTTPS — no certificate to inspect')
    const origin = new URL(url).origin
    const { tableNames } = (await wc.debugger.sendCommand('Network.getCertificate', { origin })) as { tableNames: string[] }
    if (!tableNames?.length) throw new Error('No certificate data available — try navigating to the page first')
    const cert = new X509Certificate(Buffer.from(tableNames[0], 'base64'))
    const now = new Date()
    const validTo = new Date(cert.validTo)
    return {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      isExpired: validTo < now,
      daysUntilExpiry: Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      fingerprint256: cert.fingerprint256,
    }
  }

  async setClaudeTabExtraHeaders(winId: number, headers: Record<string, string>, tabId = CLAUDE_TAB_ID): Promise<void> {
    await this.claudeTabWebContents(winId, tabId).debugger.sendCommand('Network.setExtraHTTPHeaders', { headers })
  }

  listUserTabs(winId: number): Array<{ id: string; url: string; title: string }> {
    const entries = this.viewsByWindow.get(winId)
    if (!entries) return []
    const result: Array<{ id: string; url: string; title: string }> = []
    for (const [id, entry] of entries) {
      if (id === CLAUDE_TAB_ID) continue
      const wc = entry.view.webContents
      result.push({ id, url: wc.getURL(), title: wc.getTitle() })
    }
    return result
  }

  hasTab(winId: number, tabId: string): boolean {
    return !!this.viewsByWindow.get(winId)?.has(tabId)
  }

  async navigateUserTab(winId: number, tabId: string, url: string): Promise<void> {
    await this.claudeTabWebContents(winId, tabId).loadURL(url)
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
