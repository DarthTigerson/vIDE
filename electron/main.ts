import { app, BrowserWindow, ipcMain, dialog, Menu, shell, webContents, nativeImage } from 'electron'
import { basename, join } from 'path'
import { is } from '@electron-toolkit/utils'
import { access, cp, mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { PtyManager } from './pty'
import { ClaudeManager } from './claude'
import { BrowserOpenShim } from './browserOpenShim'
import { GitRunner } from './gitRunner'
import { GraphifyManager } from './graphify'
import { GitWatcher } from './gitWatcher'
import { DockerRunner } from './dockerRunner'
import { DockerWatcher } from './dockerWatcher'
import { FileWatcher } from './fileWatcher'
import { MobileServer } from './mobile'
import { UsageManager } from './usageManager'
import { BridgeManager } from './bridge'
import { AutocompleteManager } from './autocomplete'
import { InlineEditManager } from './inlineEdit'
import { CommitMessageManager } from './commitMessage'
import { BrowserViewManager } from './browserViews'
import { LanguageServerManager } from './lsp/manager'
import { listAllFiles, searchText, buildTree, readImageDataUrl } from './fsOps'
import { registerSessionHandlers } from './session'
import { registerRecentProjectsHandlers, readRecents, addRecentProject, clearRecentProjects } from './recentProjects'
import { registerTodoHandlers } from './todos'
import { registerTodoMcpHandlers, registerNotesMcpHandlers } from './mcp/mcpRegistration'
import { registerNotesHandlers } from './notes'
import { UpdateChecker } from './updateChecker'
import { getChangelogForVersion } from './changelog'
import { getSystemMemoryUsage } from './systemMemory'
import { registerOnboardingHandlers } from './onboarding'

function registerFsHandlers(): void {
  ipcMain.handle('fs:readDir', (_e, path: string) => buildTree(path))
  ipcMain.handle('fs:readFile', (_e, path: string) => readFile(path, 'utf-8'))
  ipcMain.handle('fs:readImageDataUrl', (_e, path: string) => readImageDataUrl(path))
  ipcMain.handle('fs:exists', async (_e, path: string) => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('fs:homeDir', () => homedir())
  ipcMain.handle('fs:writeFile', (_e, path: string, content: string) =>
    writeFile(path, content, 'utf-8')
  )
  ipcMain.handle('fs:mkdir', (_e, path: string) => mkdir(path, { recursive: false }))
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => rename(from, to))
  ipcMain.handle('fs:trash', (_e, path: string) => shell.trashItem(path))
  ipcMain.handle('fs:listAllFiles', (_e, root: string) => listAllFiles(root))
  ipcMain.handle('fs:searchText', (_e, root: string, query: string, caseSensitive: boolean) =>
    searchText(root, query, caseSensitive)
  )
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
}

function registerSystemHandlers(): void {
  ipcMain.handle('system:getMemoryUsage', () => getSystemMemoryUsage())
}

function registerDevtoolsHandlers(): void {
  ipcMain.handle('devtools:attach', (_e, targetId: number, hostId: number) => {
    const target = webContents.fromId(targetId)
    const host = webContents.fromId(hostId)
    if (!target || !host) return
    target.setDevToolsWebContents(host)
    target.openDevTools()
  })

  ipcMain.handle('devtools:detach', (_e, targetId: number) => {
    webContents.fromId(targetId)?.closeDevTools()
  })
}

function registerWindowHandlers(): void {
  // Renderer notifies main whenever its projectRoot changes (either "Open
  // Project…" replacing the current window's project, or the initial
  // project set via window:getInitialProject) so the Window menu's
  // w.getTitle() reflects the current project rather than staying frozen at
  // whatever createWindow() set at construction time.
  ipcMain.on('window:setTitle', (event, root: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    win.setTitle(basename(root))
    windowProjectRoots.set(win.id, root)
  })

  // Renderer pulls its initial project once, on startup, instead of main
  // pushing it via 'did-finish-load' — pushing raced against the renderer's
  // own bootstrap effect (JS is single-threaded, so the IPC message could
  // never arrive in time to be observed by the very next synchronous line)
  // and never re-fired on reload. Pulling is deterministic and one-shot: the
  // entry is deleted on first read, so a later reload correctly falls back
  // to restoreRoot(), matching how a reloaded window should behave.
  ipcMain.handle('window:getInitialProject', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const project = pendingInitialProject.get(win.id) ?? null
    pendingInitialProject.delete(win.id)
    return project
  })

  ipcMain.handle('window:openInNewWindow', (_e, path: string) => openProjectInNewWindow(path))

  // Lets the "Switch Project…" (Ctrl+R) palette jump to an already-open
  // window instead of reloading the project into the current window or
  // spawning a duplicate one.
  ipcMain.handle('window:focusProjectIfOpen', (_e, path: string) => {
    for (const [id, root] of windowProjectRoots) {
      if (root !== path) continue
      const win = windows.get(id)
      if (!win || win.isDestroyed()) continue
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      return true
    }
    return false
  })
}

const windows = new Map<number, BrowserWindow>()
// Keyed by window id, kept in sync with each window's current project root
// via the 'window:setTitle' message the renderer already sends on every
// project switch — reused here rather than adding a second channel just to
// track the same value. Consulted by 'window:focusProjectIfOpen' above.
const windowProjectRoots = new Map<number, string>()
// Keyed by window id, populated in createWindow() when a projectRoot is
// passed. Consumed exactly once by the 'window:getInitialProject' handler
// above — see registerWindowHandlers() for why this replaced the old
// push-based 'menu:openInitialProject' message.
const pendingInitialProject = new Map<number, string>()

function createWindow(projectRoot?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: projectRoot ? basename(projectRoot) : 'vIDE',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  windows.set(win.id, win)
  win.once('ready-to-show', () => win.show())
  win.on('focus', () => buildMenu())
  // index.html declares <title>vIDE</title>, and Electron lets the loaded
  // page's title win over the constructor's `title:` option (and over any
  // later win.setTitle(...) call) once that tag is parsed — without this,
  // the project-name title set above would be silently clobbered back to
  // "vIDE" right after load. Preventing the default keeps our title.
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('closed', () => {
    windows.delete(win.id)
    windowProjectRoots.delete(win.id)
    ptyMgr.disposeWindow(win.id)
    claudeMgr.disposeWindow(win.id)
    gitWatcher.disposeWindow(win.id)
    dockerWatcher.disposeWindow(win.id)
    fileWatcher.disposeWindow(win.id)
    bridgeMgr.disposeWindow(win.id)
    browserViewMgr.disposeWindow(win.id)
    autocompleteMgr.disposeWindow(win.id)
    inlineEditMgr.disposeWindow(win.id)
    commitMessageMgr.disposeWindow(win.id)
    lspMgr.disposeWindow(win.id)
    buildMenu()
  })

  // Chromium persists page zoom per-origin across restarts. If it ever gets
  // stuck at some large factor (e.g. a stray native zoom accelerator firing
  // repeatedly), that would otherwise survive indefinitely — force it back to
  // 100% on every load so the window can never get stuck zoomed.
  win.webContents.on('dom-ready', () => {
    win.webContents.setZoomFactor(1)
  })

  // dom-ready fires on the initial load AND on every Reload/Force Reload —
  // those menu roles only reload win.webContents, not the whole BrowserWindow,
  // so any WebContentsView guests browserViewMgr previously attached to
  // win.contentView (see browserViews.ts) survive the reload as orphans: the
  // fresh renderer that comes up has no id to reach them, but they're still
  // attached and visible on top of it. Flushing them here (a no-op on first
  // load, when there's nothing to flush yet) keeps a reload from ever leaving
  // a stale webview floating over the UI.
  win.webContents.on('dom-ready', () => {
    browserViewMgr.disposeWindow(win.id)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (projectRoot) {
    pendingInitialProject.set(win.id, projectRoot)
    windowProjectRoots.set(win.id, projectRoot)
  }

  return win
}

async function openProjectInNewWindow(path: string): Promise<void> {
  await addRecentProject(path)
  createWindow(path)
  buildMenu()
}

app.name = 'vIDE'

// One-time, non-destructive migration for users upgrading from Huginn: copy
// the old userData directory (settings, usage history, etc.) into the new
// vIDE one before anything reads from it. The old directory is left in
// place rather than moved, so this is safe to run on every launch.
async function migrateUserDataFromHuginn(): Promise<void> {
  const newDir = app.getPath('userData')
  try {
    await access(newDir)
    return
  } catch {}

  const oldDir = join(app.getPath('appData'), 'Huginn')
  try {
    await access(oldDir)
  } catch {
    return
  }

  try {
    await cp(oldDir, newDir, { recursive: true })
    console.log('[migrate] Copied userData from Huginn to vIDE.')
  } catch (err) {
    console.warn('[migrate] Failed to migrate userData from Huginn to vIDE:', err)
  }
}

function registerBridgeSettingsHandlers(): void {
  const settingsPath = join(app.getPath('userData'), 'bridge-settings.json')

  ipcMain.handle('bridge:getSettings', async () => {
    try {
      const data = await readFile(settingsPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  })

  ipcMain.handle('bridge:setSettings', async (_e, settings: { endpoint: string; apiKey: string; modelId: string }) => {
    try {
      await writeFile(settingsPath, JSON.stringify(settings), 'utf-8')
    } catch {}
  })
}

// nativeImage.createFromPath/createFromDataURL silently drop the alpha
// channel on this Electron version (confirmed: decoded RGBA PNGs re-encode
// as opaque RGB), so any custom PNG/SVG-sourced icon renders as a solid
// block once marked as a template image. createFromNamedImage wraps a
// native AppKit resource directly instead, bypassing that decode path, so
// it's the only icon source that actually renders correctly here.
function darwinMenuIcon(imageName: string): Electron.NativeImage | undefined {
  if (process.platform !== 'darwin') return undefined
  const icon = nativeImage.createFromNamedImage(imageName).resize({ width: 16, height: 16 })
  icon.setTemplateImage(true)
  return icon
}

async function buildMenu(): Promise<void> {
  try {
  const recents = await readRecents()
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'vIDE',
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates…',
          icon: darwinMenuIcon('NSImageNameRefreshTemplate'),
          click: async () => {
            const info = await updateChecker?.check()
            if (info) return
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('update:upToDate', app.getVersion())
          },
        },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:openSettings')
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:newFile')
          },
        },
        {
          label: 'New Folder',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:newFolder')
          },
        },
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:newTerminal')
          },
        },
        { type: 'separator' },
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:openProject')
          },
        },
        { type: 'separator' },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: async () => {
            const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
            if (result.canceled || !result.filePaths[0]) return
            await openProjectInNewWindow(result.filePaths[0])
          },
        },
        {
          label: 'Recent Projects',
          submenu: recents.length === 0
            ? [{ label: 'No Recent Projects', enabled: false }]
            : [
                ...recents.map((r) => ({
                  label: r.path,
                  click: () => openProjectInNewWindow(r.path),
                })),
                { type: 'separator' as const },
                {
                  label: 'Clear Recent Projects',
                  click: async () => {
                    await clearRecentProjects()
                    buildMenu()
                  },
                },
              ],
        },
        {
          label: 'Switch Project…',
          accelerator: 'Control+R',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:recentProjectsPalette')
          },
        },
        { type: 'separator' },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:reopenClosedTab')
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:save')
          },
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:closeActiveTab')
          },
        },
        { role: 'close', label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          // No accelerator: Cmd+F is left for Monaco's own find widget to
          // handle directly when an editor is focused. This menu item still
          // exists for mouse/menu access, which App.tsx's onMenuFind handler
          // triggers on the focused editor the same way.
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:find')
          },
        },
        {
          label: 'Find in Files',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:findInFiles')
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        // Control+R is claimed by "Switch Project…" above, so Reload/Force
        // Reload need non-colliding accelerators on Linux (mac keeps its
        // Cmd+R/Cmd+Shift+R defaults, which never overlapped Control+R).
        process.platform === 'darwin'
          ? { role: 'reload' }
          : { role: 'reload', accelerator: 'Control+Shift+R' },
        process.platform === 'darwin'
          ? { role: 'forceReload' }
          : { role: 'forceReload', accelerator: 'Control+Alt+Shift+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          // No accelerator here on purpose — CmdOrCtrl+B is handled by a
          // renderer-level capture-phase keydown listener instead (see
          // App.tsx), which is reliable even when Monaco has focus, unlike
          // this native menu accelerator (its keystroke could get swallowed
          // by Monaco's own input handling before ever reaching this).
          // Keeping BOTH active would double-toggle on every press outside
          // Monaco, since preventDefault() in the renderer doesn't suppress
          // a native accelerator. The menu item stays clickable by mouse.
          label: 'Toggle Sidebar',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:toggleSidebar')
          },
        },
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:commandPalette')
          },
        },
        {
          label: 'Action Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:actionPalette')
          },
        },
        {
          label: 'Show Claude Chat',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:toggleClaudeChat')
          },
        },
        { type: 'separator' },
        {
          // Unshifted CmdOrCtrl+Plus/Minus/0 are intentionally NOT registered here —
          // they're left free so the renderer can handle them per-focused-editor/terminal.
          // Shifted variants control the global app font size instead.
          label: 'Reset Zoom (Global)',
          accelerator: 'CmdOrCtrl+Shift+0',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:resetZoom')
          },
        },
        {
          label: 'Zoom In (Global)',
          accelerator: 'CmdOrCtrl+Shift+=',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:zoomIn')
          },
        },
        {
          label: 'Zoom Out (Global)',
          accelerator: 'CmdOrCtrl+Shift+-',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:zoomOut')
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        ...Array.from(windows.values())
          .filter((w) => !w.isDestroyed())
          .map((w) => ({
            label: w.getTitle(),
            type: 'radio' as const,
            checked: w === BrowserWindow.getFocusedWindow(),
            click: () => {
              if (!w.isDestroyed()) w.focus()
            },
          })),
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } catch (err) {
    console.error('buildMenu failed:', err)
  }
}

let ptyMgr: PtyManager
let claudeMgr: ClaudeManager
let gitWatcher: GitWatcher
let dockerWatcher: DockerWatcher
let fileWatcher: FileWatcher
let bridgeMgr: BridgeManager
let browserViewMgr: BrowserViewManager
let autocompleteMgr: AutocompleteManager
let inlineEditMgr: InlineEditManager
let commitMessageMgr: CommitMessageManager
let lspMgr: LanguageServerManager
let updateChecker: UpdateChecker | null = null

app.whenReady().then(async () => {
  await migrateUserDataFromHuginn()

  if (process.platform === 'darwin') {
    try {
      app.dock?.setIcon(join(__dirname, '../../icon.png'))
    } catch (err) {
      console.warn('Failed to set Dock icon:', err)
    }
  }

  registerFsHandlers()
  registerBridgeSettingsHandlers()
  registerDevtoolsHandlers()
  registerSessionHandlers()
  registerRecentProjectsHandlers()
  registerTodoHandlers()
  registerTodoMcpHandlers()
  registerNotesHandlers()
  registerNotesMcpHandlers()
  registerWindowHandlers()
  registerSystemHandlers()
  registerOnboardingHandlers()

  ptyMgr = new PtyManager()
  ptyMgr.registerHandlers()
  const browserOpenShim = new BrowserOpenShim(app.getPath('userData'))
  browserOpenShim.start()
  claudeMgr = new ClaudeManager(browserOpenShim)
  claudeMgr.registerHandlers()
  const gitRunner = new GitRunner()
  gitRunner.registerHandlers()
  const dockerRunner = new DockerRunner()
  dockerRunner.registerHandlers()

  const graphifyMgr = new GraphifyManager()
  graphifyMgr.registerHandlers()
  gitWatcher = new GitWatcher()
  gitWatcher.registerHandlers()
  dockerWatcher = new DockerWatcher()
  dockerWatcher.registerHandlers()
  fileWatcher = new FileWatcher()
  fileWatcher.registerHandlers()
  bridgeMgr = new BridgeManager()
  bridgeMgr.registerHandlers()
  browserViewMgr = new BrowserViewManager()
  browserViewMgr.registerHandlers()
  autocompleteMgr = new AutocompleteManager()
  autocompleteMgr.registerHandlers()
  inlineEditMgr = new InlineEditManager()
  inlineEditMgr.registerHandlers()
  commitMessageMgr = new CommitMessageManager()
  commitMessageMgr.registerHandlers()
  lspMgr = new LanguageServerManager()
  lspMgr.registerHandlers()

  buildMenu()
  createWindow()

  // MobileServer and UsageManager (deliberately left untouched — app-wide
  // singletons per the spec, not per-window) push events to whatever `win`
  // they were constructed with. With multiple real windows there's no single
  // correct target — their state is account-level (pairing PIN, usage stats),
  // not tied to any one project — so give them a fake win-shaped object whose
  // webContents.send() broadcasts to every currently-open window instead.
  const broadcastWin = {
    webContents: {
      send: (...args: unknown[]) => {
        for (const w of windows.values()) {
          if (!w.isDestroyed()) (w.webContents.send as (...a: unknown[]) => void)(...args)
        }
      },
    },
  } as unknown as BrowserWindow

  const usageMgr = new UsageManager(
    join(app.getPath('userData'), 'usage-history.jsonl'),
    join(app.getPath('userData'), 'usage-settings.json'),
    join(app.getPath('userData'), 'usage-passive-settings.json'),
    broadcastWin
  )
  usageMgr.registerHandlers()

  const mobileSrv = new MobileServer(broadcastWin, usageMgr)
  mobileSrv.registerHandlers()

  updateChecker = new UpdateChecker(app.getVersion(), (info) => {
    broadcastWin.webContents.send('update:available', info)
  })
  updateChecker.registerHandlers()
  updateChecker.start()

  ipcMain.on('update:restart', () => {
    // quit() (not exit()) — exit() doesn't wait for pending operations, and
    // the renderer's localStorage write (the flag that tells the next
    // launch to show the changelog modal) needs to actually flush to disk
    // first.
    app.relaunch()
    app.quit()
  })

  ipcMain.handle('changelog:getForVersion', (_e, version: string) => getChangelogForVersion(version))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
