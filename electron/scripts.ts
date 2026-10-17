import { app, BrowserWindow, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import { join } from 'path'
import {
  createScript, deleteScript, liveScripts, readScriptsData, scriptsFile, updateScript, type Script,
} from './scriptsData'
import { addScriptTag, readScriptTags, removeScriptTag } from './scriptTags'
import { handleRunScriptRequest } from './scriptRunRoute'
import { SCRIPT_RUN_TIMEOUT_MS } from './scriptRun'
import type { BrowserBridge } from './browserBridge'
import type { PtyManager } from './pty'

function dataDir(): string {
  return app.getPath('userData')
}

export function broadcastScriptsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('scripts:changed')
  }
}

// The vide-scripts MCP server writes scripts.json from its own process, and
// vIDE Sync rewrites it on pull — watching the file is what lets the panel
// pick either up without polling.
let watcher: FSWatcher | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

function startScriptsWatcher(): void {
  if (watcher) return
  watcher = watch([scriptsFile(dataDir()), join(dataDir(), 'script-tags.json')], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100 },
  })
  watcher.on('all', () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(broadcastScriptsChanged, 150)
  })
  watcher.on('error', (err) => console.error('ScriptsWatcher error:', err))
}

export function registerScriptsHandlers(): void {
  ipcMain.handle('scripts:list', async () => {
    startScriptsWatcher()
    return liveScripts(await readScriptsData(dataDir()))
  })
  ipcMain.handle('scripts:create', (_e, input: { title: string; description?: string; body?: string; shareOutput?: boolean }) =>
    createScript(dataDir(), input),
  )
  ipcMain.handle('scripts:update', (_e, id: string, patch: Partial<Pick<Script, 'title' | 'description' | 'body' | 'shareOutput'>>) =>
    updateScript(dataDir(), id, patch),
  )
  ipcMain.handle('scripts:delete', (_e, id: string) => deleteScript(dataDir(), id))
  ipcMain.handle('scripts:tags', () => readScriptTags(dataDir()))
  ipcMain.handle('scripts:tagAdd', (_e, id: string, projectRoot: string) => addScriptTag(dataDir(), id, projectRoot))
  ipcMain.handle('scripts:tagRemove', (_e, id: string, projectRoot: string) => removeScriptTag(dataDir(), id, projectRoot))
}

// Claude's run_script: the vide-scripts MCP server posts to /run-script on the
// bridge socket of the window its Claude panel lives in; that window opens a
// terminal tab for the script and this side waits for the exit marker.
export function registerScriptRunRoute(bridge: BrowserBridge, ptyMgr: PtyManager): void {
  bridge.registerRoute('/run-script', (windowId, body) =>
    handleRunScriptRequest(
      {
        dataDir: dataDir(),
        timeoutMs: SCRIPT_RUN_TIMEOUT_MS,
        watch: (winId, terminalId, onData, onExit) => ptyMgr.watch(winId, terminalId, onData, onExit),
        sendRunRequest: (winId, req) => {
          const win = BrowserWindow.fromId(winId)
          if (!win || win.isDestroyed()) return false
          win.webContents.send('scripts:run-request', req)
          return true
        },
      },
      windowId,
      body,
    ),
  )
}
