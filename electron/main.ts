import { app, BrowserWindow, ipcMain, dialog, Menu, webContents, nativeImage, screen } from 'electron'
import { basename, join } from 'path'
import { is } from '@electron-toolkit/utils'
import { access, cp } from 'fs/promises'
import { PtyManager } from './pty'
import { ClaudeManager } from './claude'
import { BrowserBridge } from './browserBridge'
import { GitRunner } from './gitRunner'
import { GraphifyManager } from './graphify'
import { createGraphifyInstaller } from './graphifyInstall'
import { LlamaManager } from './llama'
import { bundledLlamaDir, findInstalledLlamaServer, installLlama } from './autocomplete/llamaInstall'
import { GitWatcher } from './gitWatcher'
import { DockerRunner } from './dockerRunner'
import { DockerWatcher } from './dockerWatcher'
import { FileWatcher } from './fileWatcher'
import { MobileServer, MOBILE_RELAY_WINDOW_ID } from './mobile'
import { UsageManager } from './usageManager'
import { BridgeManager, getBridgeSettings, setBridgeSettings } from './bridge'
import { AutocompleteManager } from './autocomplete/manager'
import { InlineEditManager } from './inlineEdit'
import { CommitMessageManager } from './commitMessage'
import { BrowserViewManager } from './browserViews'
import { LanguageServerManager } from './lsp/manager'
import {
  listAllFiles, searchText, buildTree, readImageDataUrl,
  readTextFile, pathExists, getHomeDir, writeFile as fsWriteFile, mkdir, renamePath, trashPath, revealInFinder,
  copyInto, moveInto,
} from './fsOps'
import { writeClipboardFiles, readClipboardFiles } from './fileClipboard'
import { registerSessionHandlers, loadSession, saveSession, loadOpenWindows, saveOpenWindows, getAgentSessionInfo, type WindowBounds } from './session'
import { childrenByParent, readProcessTable, treeRssBytes } from './processMemory'
import { fitBoundsToDisplays } from './windowBounds'
import { registerRecentProjectsHandlers, readRecents, addRecentProject, clearRecentProjects } from './recentProjects'
import { registerTodoHandlers } from './todos'
import { registerTodoMcpHandlers, registerNotesMcpHandlers, registerBrowserMcpHandlers, registerScriptsMcpHandlers, registerSearchMcpHandlers } from './mcp/mcpRegistration'
import { registerNotesHandlers } from './notes'
import { registerScriptsHandlers, registerScriptRunRoute } from './scripts'
import { registerSearchHandlers } from './search'
import { UpdateChecker } from './updateChecker'
import { UpdateRunner } from './updateRunner'
import { getChangelogForVersion, getChangelogReleases } from './changelog'
import { getSystemMemoryUsage } from './systemMemory'
import { getBatteryStatus } from './systemBattery'
import { registerOnboardingHandlers } from './onboarding'
import { registerConfigRepoHandlers } from './configRepo'

function registerFsHandlers(): void {
  ipcMain.handle('fs:readDir', (_e, path: string) => buildTree(path))
  ipcMain.handle('fs:readFile', (_e, path: string) => readTextFile(path))
  ipcMain.handle('fs:readImageDataUrl', (_e, path: string) => readImageDataUrl(path))
  ipcMain.handle('fs:exists', (_e, path: string) => pathExists(path))
  ipcMain.handle('fs:homeDir', () => getHomeDir())
  ipcMain.handle('fs:writeFile', (_e, path: string, content: string) => fsWriteFile(path, content))
  ipcMain.handle('fs:mkdir', (_e, path: string) => mkdir(path))
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => renamePath(from, to))
  ipcMain.handle('fs:trash', (_e, path: string) => trashPath(path))
  ipcMain.handle('fs:copyInto', (_e, source: string, destDir: string) => copyInto(source, destDir))
  ipcMain.handle('fs:moveInto', (_e, source: string, destDir: string) => moveInto(source, destDir))
  ipcMain.handle('clipboard:writeFiles', (_e, paths: string[], mode: 'copy' | 'cut') => writeClipboardFiles(paths, mode))
  ipcMain.handle('clipboard:readFiles', () => readClipboardFiles())
  ipcMain.handle('fs:revealInFinder', (_e, path: string) => revealInFinder(path))
  ipcMain.handle('fs:listAllFiles', (_e, root: string) => listAllFiles(root))
  ipcMain.handle('fs:searchText', (_e, root: string, query: string, caseSensitive: boolean) =>
    searchText(root, query, caseSensitive)
  )
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('dialog:openFile', async (_e, opts: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.on('window:setUnsavedState', (event, state: UnsavedState) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) unsavedByWindow.set(win.id, state)
  })
  // "Save As" for a scratch tab — the renderer has no file path to write to
  // until the user picks one. Returns null on cancel, same as the two above,
  // so a cancelled save is indistinguishable from never having asked.
  ipcMain.handle('dialog:saveFile', async (_e, opts: { defaultPath?: string }) => {
    const result = await dialog.showSaveDialog({ defaultPath: opts?.defaultPath })
    return result.canceled || !result.filePath ? null : result.filePath
  })
}

// app.getAppMetrics() covers every one of Electron's own OS processes - main,
// every renderer window, GPU, and any utility/zygote helpers. It does not see
// the child processes vIDE starts (Claude CLIs, shells, language servers);
// system:getMemoryBreakdown adds those up separately.
// workingSetSize is in KB on both platforms vIDE ships (see systemMemory.ts).
function electronAppBytes(): number {
  return app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize * 1024, 0)
}

function registerSystemHandlers(): void {
  ipcMain.handle('system:getMemoryUsage', async () => {
    const system = await getSystemMemoryUsage()
    return { ...system, appBytes: electronAppBytes() }
  })
  // The RAM panel's hover breakdown, fetched only while it is open. One `ps`
  // call; each tracked process is counted with everything it started.
  ipcMain.handle('system:getMemoryBreakdown', async () => {
    const table = await readProcessTable().catch(() => new Map())
    const children = childrenByParent(table)
    const sumTrees = (pids: number[]) => pids.reduce((sum, pid) => sum + treeRssBytes(pid, table, children), 0)
    return {
      appBytes: electronAppBytes(),
      sessions: claudeMgr.listProcesses().map(({ windowId, instanceId, pid }) => ({
        instanceId,
        projectRoot: windowProjectRoots.get(windowId) ?? null,
        ...getAgentSessionInfo(instanceId),
        bytes: treeRssBytes(pid, table, children),
      })),
      terminalsBytes: sumTrees(ptyMgr.listPids()),
      languageServersBytes: sumTrees(lspMgr.listPids()),
      autocompleteBytes: autocompleteMgr.pid ? treeRssBytes(autocompleteMgr.pid, table, children) : 0,
    }
  })
  ipcMain.handle('system:getBattery', () => getBatteryStatus())
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
    persistOpenWindows()
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

  // Lets the "Switch Project…" (Cmd+Shift+R) palette jump to an already-open
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

// Per-window tally of tabs with unsaved work, pushed up from the renderer
// whenever it changes (see 'window:setUnsavedState'). Kept here rather than
// asked for during 'close' because that event is synchronous — there is no
// chance to await an answer from the renderer before deciding.
interface UnsavedState { dirty: number; neverSaved: number }
const unsavedByWindow = new Map<number, UnsavedState>()
// Windows whose close the user has already confirmed, so the second pass
// through the handler below lets it through instead of re-prompting.
const confirmedClose = new Set<number>()
// Windows with the unsaved-work prompt already up. A second Cmd+Q or close
// click while it is showing would otherwise stack another dialog on top.
const promptingClose = new Set<number>()
// e.preventDefault() in a 'close' handler cancels an in-flight app.quit()
// outright, so a Cmd+Q with unsaved work would close the one window that
// prompted and leave the app running. Tracked here so a confirmed close can
// re-issue the quit, and a cancelled one can call it off properly.
let quitting = false
app.on('before-quit', () => {
  quitting = true
  persistOpenWindows()
})
// Never leave the multi-GB autocomplete model running after vIDE is gone.
// will-quit, not before-quit: an unsaved-work prompt can still cancel a quit
// after before-quit, and that would leave autocomplete dead but "running".
app.on('will-quit', () => {
  autocompleteMgr?.dispose()
})
// Windows whose renderer has stopped responding, so reloadAllWindows() knows
// to crash them first — a reload request alone never gets through to a hung
// renderer.
const unresponsiveWindows = new Set<number>()

// "Restart vIDE" (Cmd+Alt+R; Ctrl+Alt+R on Linux): the same renderer reload
// the old Cmd+R did, but for every window. Deliberately not app.relaunch():
// that kills every PTY/agent session (a reload re-attaches to them), and
// under `npm run dev` quitting also stops the dev server, so the relaunched
// app loads a dead URL. No confirm — it's the last-resort recovery for a
// frozen window.
function reloadAllWindows(): void {
  for (const win of windows.values()) {
    if (win.isDestroyed()) continue
    if (unresponsiveWindows.has(win.id)) win.webContents.forcefullyCrashRenderer()
    win.webContents.reload()
  }
}
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

// Records which projects are open, in window-opening order, so the next
// launch reopens them all (see restoreOpenWindows). Never writes an empty
// list: the windows closing one by one during a quit, or the last window
// closing just before the app exits on Linux, would otherwise wipe out the
// very session that should come back. Skipped mid-quit for the same reason —
// before-quit has already recorded the full set.
function persistOpenWindows(): void {
  if (windows.size === 0) return
  const roots = [...windows.keys()]
    .map((id) => windowProjectRoots.get(id))
    .filter((root): root is string => !!root)
  void saveOpenWindows(roots)
}

// Remembered per project rather than per window, so a project reopens at its
// own size whichever way it is opened (relaunch, Recent Projects, palette).
function saveWindowBounds(win: BrowserWindow): void {
  const root = windowProjectRoots.get(win.id)
  if (!root || win.isDestroyed()) return
  // getNormalBounds: the un-maximized size, so un-maximizing after a restore
  // goes back to the user's own size rather than to the full screen.
  void saveSession(root, { windowBounds: { ...win.getNormalBounds(), maximized: win.isMaximized() } })
}

function boundsOptionsFor(saved?: WindowBounds): { x?: number; y?: number; width: number; height: number } {
  if (!saved) return { width: 1440, height: 900 }
  const primary = screen.getPrimaryDisplay()
  const workAreas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea)
  return fitBoundsToDisplays(saved, workAreas)
}

function createWindow(projectRoot?: string, savedBounds?: WindowBounds): BrowserWindow {
  const win = new BrowserWindow({
    ...boundsOptionsFor(savedBounds),
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
  if (savedBounds?.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.on('unresponsive', () => unresponsiveWindows.add(win.id))
  win.on('responsive', () => unresponsiveWindows.delete(win.id))
  win.on('focus', () => buildMenu())
  // index.html declares <title>vIDE</title>, and Electron lets the loaded
  // page's title win over the constructor's `title:` option (and over any
  // later win.setTitle(...) call) once that tag is parsed — without this,
  // the project-name title set above would be silently clobbered back to
  // "vIDE" right after load. Preventing the default keeps our title.
  win.on('page-title-updated', (e) => e.preventDefault())
  // Nothing in the app prompted before losing unsaved work on window close.
  // Survivable for a tab backed by a file — the on-disk copy is still there —
  // but a never-saved scratch tab exists nowhere else, so this warns about
  // the two cases separately rather than lumping them together.
  win.on('close', (e) => {
    saveWindowBounds(win)
    if (confirmedClose.has(win.id)) return
    const unsaved = unsavedByWindow.get(win.id)
    if (!unsaved || (unsaved.dirty === 0 && unsaved.neverSaved === 0)) return

    e.preventDefault()
    if (promptingClose.has(win.id)) return
    promptingClose.add(win.id)
    const lines: string[] = []
    if (unsaved.neverSaved > 0) {
      lines.push(`${unsaved.neverSaved} file${unsaved.neverSaved === 1 ? ' has' : 's have'} never been saved and cannot be recovered.`)
    }
    if (unsaved.dirty > 0) {
      lines.push(`${unsaved.dirty} file${unsaved.dirty === 1 ? '' : 's'} with unsaved changes will revert to the last saved version.`)
    }
    dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Close anyway'],
      defaultId: 0,
      cancelId: 0,
      // Closing the last window also quits on Linux (see 'window-all-closed'
      // below); on macOS the app stays resident, so it is only a window close.
      message: quitting || (windows.size === 1 && process.platform !== 'darwin')
        ? 'Quit vIDE?'
        : 'Close this window?',
      detail: lines.join('\n'),
    }).then(({ response }) => {
      promptingClose.delete(win.id)
      if (response !== 1) {
        quitting = false
        // Windows closed earlier in the cancelled quit are gone for good.
        persistOpenWindows()
        return
      }
      confirmedClose.add(win.id)
      // close(), not destroy(): destroy() skips the normal teardown, and the
      // guard above already stops this handler running twice. Any remaining
      // window prompts for itself when the quit resumes.
      win.close()
      if (quitting) app.quit()
    })
  })

  win.on('closed', () => {
    windows.delete(win.id)
    unresponsiveWindows.delete(win.id)
    unsavedByWindow.delete(win.id)
    confirmedClose.delete(win.id)
    promptingClose.delete(win.id)
    windowProjectRoots.delete(win.id)
    if (!quitting) persistOpenWindows()
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
    persistOpenWindows()
  }

  return win
}

async function openProjectInNewWindow(path: string): Promise<void> {
  await addRecentProject(path)
  createWindow(path, (await loadSession(path))?.windowBounds)
  buildMenu()
}

// Launch: reopen every window that was open when vIDE last quit, each at its
// project's saved size. Projects deleted since then are skipped; with nothing
// left (first launch, or upgrading from before this existed) it opens the one
// window it always has, which restores the last project on its own.
// True until restoreOpenWindows() has opened its windows, so a Dock
// 'activate' landing mid-restore doesn't add a stray empty window.
let restoringWindows = true

async function restoreOpenWindows(): Promise<void> {
  const roots = [...new Set(await loadOpenWindows())]
  let opened = 0
  for (const root of roots) {
    try {
      await access(root)
    } catch {
      continue
    }
    createWindow(root, (await loadSession(root))?.windowBounds)
    opened++
  }
  if (opened === 0) createWindow()
  restoringWindows = false
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
  ipcMain.handle('bridge:getSettings', () => getBridgeSettings())
  ipcMain.handle('bridge:setSettings', (_e, settings: { endpoint: string; apiKey: string; modelId: string }) =>
    setBridgeSettings(settings)
  )
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
        {
          // The frozen-window escape hatch — a native accelerator fires from
          // the main process even when the renderer is hung. Control on Linux,
          // where Cmd doesn't exist (and plain Control+R is the terminal's).
          label: 'Restart vIDE',
          accelerator: process.platform === 'darwin' ? 'Command+Alt+R' : 'Control+Alt+R',
          click: () => reloadAllWindows(),
        },
        {
          // Cmd+Q only closes the focused window, so quitting one project
          // doesn't take every other open window down with it. The last
          // window quits outright rather than leaving a windowless app in
          // the Dock (macOS keeps the app resident otherwise).
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win && windows.size > 1) win.close()
            else app.quit()
          },
        },
        { role: 'quit', label: 'Quit vIDE', accelerator: 'CmdOrCtrl+Shift+Q' },
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
          // Not Control+R: that's the shell's (and Claude Code's) history
          // search, and the accelerator kept stealing it from the terminal.
          label: 'Switch Project…',
          accelerator: 'CmdOrCtrl+Shift+R',
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
        // Cmd+R reloads only the focused pane's tab (EditorPane), never the
        // window — a window reload reruns the boot sync and feels like a
        // restart. macOS only: on Linux CmdOrCtrl would land back on
        // Control+R, the terminal's history search. A focused browser page
        // handles Cmd+R itself (browserViews.ts), which also stops this
        // accelerator firing.
        {
          label: 'Reload Tab',
          accelerator: process.platform === 'darwin' ? 'Command+R' : undefined,
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:reloadActive')
          },
        },
        // Plain click handlers, not role: 'reload'/'forceReload' — the roles
        // bring their own default accelerators (Cmd+R/Cmd+Shift+R), and
        // Cmd+Shift+R now belongs to "Switch Project…".
        {
          label: 'Reload Window',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.reload(),
        },
        {
          label: 'Force Reload Window',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.reloadIgnoringCache(),
        },
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
  registerSearchHandlers()
  registerBridgeSettingsHandlers()
  registerDevtoolsHandlers()
  registerSessionHandlers()
  registerRecentProjectsHandlers()
  registerTodoHandlers()
  registerTodoMcpHandlers()
  registerNotesHandlers()
  registerNotesMcpHandlers()
  registerScriptsHandlers()
  registerBrowserMcpHandlers()
  registerScriptsMcpHandlers()
  registerSearchMcpHandlers()
  registerWindowHandlers()
  registerSystemHandlers()
  registerOnboardingHandlers()
  registerConfigRepoHandlers()

  ptyMgr = new PtyManager()
  ptyMgr.registerHandlers()
  browserViewMgr = new BrowserViewManager()
  browserViewMgr.registerHandlers()
  const browserBridge = new BrowserBridge(app.getPath('userData'), browserViewMgr)
  browserBridge.start()
  registerScriptRunRoute(browserBridge, ptyMgr)
  // claude-sessions/ is machine-local (transcripts live in this machine's
  // ~/.claude) — deliberately not part of vIDE Sync.
  claudeMgr = new ClaudeManager(browserBridge, join(app.getPath('userData'), 'claude-sessions'))
  claudeMgr.registerHandlers()
  const gitRunner = new GitRunner()
  gitRunner.registerHandlers()
  const dockerRunner = new DockerRunner()
  dockerRunner.registerHandlers()

  const graphifyMgr = new GraphifyManager(createGraphifyInstaller(app.getPath('userData')))
  graphifyMgr.registerHandlers()
  const llamaMgr = new LlamaManager(
    () => (autocompleteMgr?.pid ? [autocompleteMgr.pid] : []),
    { dir: bundledLlamaDir(app.getPath('userData')), find: findInstalledLlamaServer, install: installLlama },
  )
  llamaMgr.registerHandlers()
  gitWatcher = new GitWatcher()
  gitWatcher.registerHandlers()
  dockerWatcher = new DockerWatcher()
  dockerWatcher.registerHandlers()
  fileWatcher = new FileWatcher()
  fileWatcher.registerHandlers()
  bridgeMgr = new BridgeManager()
  bridgeMgr.registerHandlers()
  autocompleteMgr = new AutocompleteManager()
  autocompleteMgr.registerHandlers()
  inlineEditMgr = new InlineEditManager()
  inlineEditMgr.registerHandlers()
  commitMessageMgr = new CommitMessageManager()
  commitMessageMgr.registerHandlers()
  lspMgr = new LanguageServerManager()
  lspMgr.registerHandlers()

  buildMenu()
  // Not awaited: the IPC handlers registered below must be in place before
  // any restored window's renderer starts calling them.
  void restoreOpenWindows()

  // MobileServer and UsageManager (deliberately left untouched — app-wide
  // singletons per the spec, not per-window) push events to whatever `win`
  // they were constructed with. With multiple real windows there's no single
  // correct target — their state is account-level (pairing PIN, usage stats),
  // not tied to any one project — so give them a fake win-shaped object whose
  // webContents.send() broadcasts to every currently-open window instead.
  // `id`/`isDestroyed()` are also faked out — a fixed id no real
  // BrowserWindow can ever have (Electron assigns positive ids), and
  // "never destroyed" since this object outlives any single real window —
  // so PtyManager/ClaudeManager (which key their per-window state off
  // `win.id` and guard sends with `win.isDestroyed()`) can treat mobile
  // relay sessions as just another window's worth of state, independent
  // from and outliving any single real desktop window.
  const broadcastWin = {
    id: MOBILE_RELAY_WINDOW_ID,
    isDestroyed: () => false,
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

  const mobileSrv = new MobileServer(
    broadcastWin,
    usageMgr,
    ptyMgr,
    claudeMgr,
    bridgeMgr,
    autocompleteMgr,
    inlineEditMgr,
    commitMessageMgr
  )
  mobileSrv.registerHandlers()

  updateChecker = new UpdateChecker(app.getVersion(), (info) => {
    broadcastWin.webContents.send('update:available', info)
  })
  updateChecker.registerHandlers()
  updateChecker.start()
  new UpdateRunner().registerHandlers()

  ipcMain.on('update:restart', () => {
    // quit() (not exit()) — exit() doesn't wait for pending operations, and
    // the renderer's localStorage write (the flag that tells the next
    // launch to show the changelog modal) needs to actually flush to disk
    // first.
    app.relaunch()
    app.quit()
  })
  ipcMain.on('app:restart', () => reloadAllWindows())

  ipcMain.handle('changelog:getForVersion', (_e, version: string) => getChangelogForVersion(version))
  ipcMain.handle('changelog:getReleases', () => getChangelogReleases())

  app.on('activate', () => {
    if (!restoringWindows && BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
