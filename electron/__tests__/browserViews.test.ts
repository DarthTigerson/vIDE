import { describe, it, expect, beforeEach, vi } from 'vitest'

const { handlers, winsById, fakeSession } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  // The given implementation resolves a bare winId back to a BrowserWindow via
  // BrowserWindow.fromId (needed by disposeWindow/setZoom, which only receive a
  // numeric id, not the ipc event). Real Electron provides this statically;
  // here it's backed by whatever fromWebContents has already seen.
  winsById: new Map<number, any>(),
  fakeSession: { clearCache: vi.fn(() => Promise.resolve()) },
}))

// Simulates capturePage()'s real confirmed-live behavior: both toPNG() and
// getSize() report the display's DEVICE pixel resolution (2x here, matching
// the live 2906x2344 vs. 1453x1172 finding) — resizing to the view's own
// logical bounds (650x400, matching fakeWebContentsView's getBounds below)
// is what should actually happen, since that's what lines up with
// click/type's coordinate space.
function fakeCapturedImage() {
  return {
    getSize: vi.fn(() => ({ width: 1300, height: 800 })),
    toPNG: () => Buffer.from('wrong-unnormalized-2x-png'),
    resize: vi.fn((_opts: { width: number; height: number }) => ({
      toPNG: () => Buffer.from('fake-png'),
      getSize: vi.fn(() => ({ width: 650, height: 400 })),
    })),
  }
}

function fakeWebContentsView() {
  return {
    setBackgroundColor: vi.fn(),
    setBounds: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 650, height: 400 })),
    webContents: {
      id: Math.floor(Math.random() * 100000),
      loadURL: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
      setUserAgent: vi.fn(),
      reload: vi.fn(),
      enableDeviceEmulation: vi.fn(),
      disableDeviceEmulation: vi.fn(),
      capturePage: vi.fn(() => Promise.resolve(fakeCapturedImage())),
      sendInputEvent: vi.fn(),
      insertText: vi.fn(() => Promise.resolve()),
      executeJavaScript: vi.fn((script: string) =>
        Promise.resolve(script.includes('activeElement') ? 'INPUT#test-input' : 'page text')
      ),
    },
  }
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => {
      winsById.set(sender.id, sender)
      return sender
    },
    fromId: (id: number) => winsById.get(id),
  },
  WebContentsView: vi.fn().mockImplementation(() => fakeWebContentsView()),
  session: { fromPartition: vi.fn(() => fakeSession) },
}))

import { BrowserViewManager } from '../browserViews'
import { WebContentsView } from 'electron'

function fakeWin(id: number) {
  return {
    id,
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    getContentBounds: vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
  }
}

describe('BrowserViewManager multi-window isolation', () => {
  it('creating a view with the same id in two windows produces two independent entries', () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)

    const idA = handlers['browserView:create']({ sender: winA }, 'tab-1', 'https://example.com')
    const idB = handlers['browserView:create']({ sender: winB }, 'tab-1', 'https://example.org')

    expect(winA.contentView.addChildView).toHaveBeenCalledTimes(1)
    expect(winB.contentView.addChildView).toHaveBeenCalledTimes(1)
    expect(idA).not.toBe(idB)
  })

  it('disposeWindow destroys only that window\'s views', () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)

    handlers['browserView:create']({ sender: winA }, 'tab-1', 'https://example.com')
    handlers['browserView:create']({ sender: winB }, 'tab-1', 'https://example.org')
    manager.disposeWindow(1)

    expect(winA.contentView.removeChildView).toHaveBeenCalledTimes(1)
    expect(winB.contentView.removeChildView).not.toHaveBeenCalled()
  })

  it('disposeWindow still closes webContents when the window is no longer resolvable via fromId (e.g. after its "closed" event has already fired)', () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const winC = fakeWin(3)

    handlers['browserView:create']({ sender: winC }, 'tab-1', 'https://example.com')
    // Simulate BrowserWindow.fromId no longer being able to resolve the window
    // by the time disposal runs.
    winsById.delete(3)

    manager.disposeWindow(3)

    const created = (WebContentsView as unknown as ReturnType<typeof vi.fn>).mock.results
    const view = created[created.length - 1].value
    expect(view.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    // win is unresolvable, so removeChildView (which needs the win object) can't be called
    expect(winC.contentView.removeChildView).not.toHaveBeenCalled()
  })
})

describe('BrowserViewManager mobile mode', () => {
  const device = { width: 390, height: 844, pixelRatio: 3 }

  it('enabling mobile mode sets a mobile user agent, emulates the device viewport, and reloads', () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const win = fakeWin(10)

    handlers['browserView:create']({ sender: win }, 'tab-1', 'https://example.com')
    const created = (WebContentsView as unknown as ReturnType<typeof vi.fn>).mock.results
    const view = created[created.length - 1].value

    handlers['browserView:setMobileMode']({ sender: win }, 'tab-1', true, device)

    expect(view.webContents.setUserAgent).toHaveBeenCalledWith(expect.stringContaining('Mobile'))
    expect(view.webContents.enableDeviceEmulation).toHaveBeenCalledWith(
      expect.objectContaining({
        viewSize: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      })
    )
    expect(view.webContents.reload).toHaveBeenCalledTimes(1)
  })

  it('disabling mobile mode resets the user agent, disables emulation, and reloads', () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const win = fakeWin(11)

    handlers['browserView:create']({ sender: win }, 'tab-1', 'https://example.com')
    const created = (WebContentsView as unknown as ReturnType<typeof vi.fn>).mock.results
    const view = created[created.length - 1].value

    handlers['browserView:setMobileMode']({ sender: win }, 'tab-1', true, device)
    handlers['browserView:setMobileMode']({ sender: win }, 'tab-1', false)

    expect(view.webContents.setUserAgent).toHaveBeenLastCalledWith('')
    expect(view.webContents.disableDeviceEmulation).toHaveBeenCalledTimes(1)
    expect(view.webContents.reload).toHaveBeenCalledTimes(2)
  })
})

describe('BrowserViewManager clear cache', () => {
  it('clears the shared session cache and reloads the requesting tab', async () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const win = fakeWin(12)

    handlers['browserView:create']({ sender: win }, 'tab-1', 'https://example.com')
    const created = (WebContentsView as unknown as ReturnType<typeof vi.fn>).mock.results
    const view = created[created.length - 1].value

    await handlers['browserView:clearCache']({ sender: win }, 'tab-1')

    expect(fakeSession.clearCache).toHaveBeenCalledTimes(1)
    expect(view.webContents.reload).toHaveBeenCalledTimes(1)
  })
})

describe('BrowserViewManager Claude-controlled tab (VIDE-53)', () => {
  function lastCreatedView() {
    const created = (WebContentsView as unknown as ReturnType<typeof vi.fn>).mock.results
    return created[created.length - 1].value
  }

  // Third design for this tab, after two that broke live: (1) a
  // WebContentsView attached at the vIDE window's own origin, full window
  // size, took over the entire app and ate all input; (2) the same view
  // positioned off past the window's edge fixed that but broke
  // capturePage() (content entirely outside a window's visible bounds
  // generally never gets a compositor surface). This version is a REAL,
  // visible tab using the exact same WebContentsView + create() path every
  // user-opened browser tab already uses (so it's reliably sized and
  // definitely has a working surface) — the only addition is telling the
  // renderer to open/focus it in the tab strip, since there's no user click
  // driving that here.

  it('navigateClaudeTab creates the tab via the same path as a user tab, and loads the url', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(20)
    winsById.set(20, win)

    await manager.navigateClaudeTab(20, 'https://example.com')

    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1)
    const view = lastCreatedView()
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://example.com')
  })

  it('navigateClaudeTab tells the renderer to open/focus the tab in the strip, only on first use', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(30)
    winsById.set(30, win)

    await manager.navigateClaudeTab(30, 'https://example.com')
    await manager.navigateClaudeTab(30, 'https://example.org')

    expect(win.webContents.send).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith('browser:open-claude-tab')
  })

  it('navigateClaudeTab reuses the same tab (attaches only once) on a second call, loading each new url', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(21)
    winsById.set(21, win)

    await manager.navigateClaudeTab(21, 'https://example.com')
    const view = lastCreatedView()
    await manager.navigateClaudeTab(21, 'https://example.org')

    expect(lastCreatedView()).toBe(view)
    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1)
    expect(view.webContents.loadURL).toHaveBeenNthCalledWith(1, 'https://example.com')
    expect(view.webContents.loadURL).toHaveBeenNthCalledWith(2, 'https://example.org')
  })

  it('navigateClaudeTab throws for a window that does not exist', async () => {
    const manager = new BrowserViewManager()
    await expect(manager.navigateClaudeTab(999, 'https://example.com')).rejects.toThrow(/999/)
  })

  it('captureClaudeTab returns the resized PNG bytes plus image/view size diagnostics', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(22)
    winsById.set(22, win)
    await manager.navigateClaudeTab(22, 'https://example.com')

    const result = await manager.captureClaudeTab(22)

    expect(result.png).toEqual(Buffer.from('fake-png'))
    expect(result.imageSize).toEqual({ width: 650, height: 400 })
    expect(result.viewBounds).toEqual({ width: 650, height: 400 })
  })

  // Regression test: capturePage()'s raw PNG bytes can encode at the
  // display's device pixel resolution (2x+ on Retina) while click/type
  // coordinates are in logical/CSS pixels — without normalizing, a click at
  // coordinates read directly off the screenshot could land roughly (scale
  // factor)x too far right/down. imageSize/viewBounds are surfaced in the
  // tool response specifically so a live mismatch is visible directly
  // instead of inferred.
  it('captureClaudeTab resizes to the logical size before encoding, so screenshot pixels line up with click/type coordinates', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(32)
    winsById.set(32, win)
    await manager.navigateClaudeTab(32, 'https://example.com')

    const result = await manager.captureClaudeTab(32)

    const view = lastCreatedView()
    const captured = await (view.webContents.capturePage as ReturnType<typeof vi.fn>).mock.results[0].value
    expect(captured.resize).toHaveBeenCalledWith({ width: 650, height: 400 })
    // Not the raw/unnormalized bytes — must be whatever resize(...) produced
    expect(result.png).toEqual(Buffer.from('fake-png'))
    expect(result.png).not.toEqual(Buffer.from('wrong-unnormalized-2x-png'))
  })

  it('captureClaudeTab throws a clear error when navigate has not been called yet', async () => {
    const manager = new BrowserViewManager()
    await expect(manager.captureClaudeTab(23)).rejects.toThrow(/navigate first/)
  })

  it('clickClaudeTab sends a mouseDown followed by a mouseUp at the given coordinates, then reports the focused element', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(24)
    winsById.set(24, win)
    await manager.navigateClaudeTab(24, 'https://example.com')
    const view = lastCreatedView()

    const activeElement = await manager.clickClaudeTab(24, 100, 200)

    expect(view.webContents.sendInputEvent).toHaveBeenNthCalledWith(1, { type: 'mouseDown', x: 100, y: 200, button: 'left', clickCount: 1 })
    expect(view.webContents.sendInputEvent).toHaveBeenNthCalledWith(2, { type: 'mouseUp', x: 100, y: 200, button: 'left', clickCount: 1 })
    expect(activeElement).toBe('INPUT#test-input')
  })

  it('clickClaudeTab reports when the click did not focus anything', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(33)
    winsById.set(33, win)
    await manager.navigateClaudeTab(33, 'https://example.com')
    const view = lastCreatedView()
    ;(view.webContents.executeJavaScript as ReturnType<typeof vi.fn>).mockResolvedValueOnce('nothing (document.body)')

    const activeElement = await manager.clickClaudeTab(33, 100, 200)

    expect(activeElement).toBe('nothing (document.body)')
  })

  it('typeIntoClaudeTab calls insertText with the given text', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(25)
    winsById.set(25, win)
    await manager.navigateClaudeTab(25, 'https://example.com')
    const view = lastCreatedView()

    await manager.typeIntoClaudeTab(25, 'hello world')

    expect(view.webContents.insertText).toHaveBeenCalledWith('hello world')
  })

  it('getClaudeTabConsoleLogs returns messages captured via the console-message listener', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(26)
    winsById.set(26, win)
    await manager.navigateClaudeTab(26, 'https://example.com')
    const view = lastCreatedView()

    const onCalls = (view.webContents.on as ReturnType<typeof vi.fn>).mock.calls
    const consoleHandler = onCalls.find(([event]: [string]) => event === 'console-message')?.[1]
    consoleHandler(undefined, 1, 'hello from the page')
    consoleHandler(undefined, 3, 'boom')

    expect(manager.getClaudeTabConsoleLogs(26)).toEqual(['[info] hello from the page', '[error] boom'])
  })

  it('getClaudeTabConsoleLogs returns an empty array before navigate has ever been called', () => {
    const manager = new BrowserViewManager()
    expect(manager.getClaudeTabConsoleLogs(27)).toEqual([])
  })

  it('readClaudeTabText returns document.body.innerText via executeJavaScript', async () => {
    const manager = new BrowserViewManager()
    const win = fakeWin(28)
    winsById.set(28, win)
    await manager.navigateClaudeTab(28, 'https://example.com')

    const text = await manager.readClaudeTabText(28)

    expect(text).toBe('page text')
  })

  it('keeps the Claude tab independent of a regular user-created tab with a different id', async () => {
    const manager = new BrowserViewManager()
    manager.registerHandlers()
    const win = fakeWin(29)
    winsById.set(29, win)

    handlers['browserView:create']({ sender: win }, 'tab-1', 'https://example.com')
    const userTabView = lastCreatedView()
    await manager.navigateClaudeTab(29, 'https://claude.example.com')
    const claudeTabView = lastCreatedView()

    // Two distinct views were created and both got attached — the user tab via
    // the ipc handler, the Claude tab via navigateClaudeTab
    expect(claudeTabView).not.toBe(userTabView)
    expect(win.contentView.addChildView).toHaveBeenCalledTimes(2)
  })
})
