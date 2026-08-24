import { BrowserWindow, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'chokidar'

interface WindowState {
  watcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  cwd: string | null
}

const IGNORED_SEGMENTS = [
  'node_modules', '.git', 'dist', 'out', '.next', 'build',
  'coverage', '.cache', '__pycache__', '.turbo', '.vite',
]

// The sidebar tree only refreshes when the app itself causes the change
// (save, create, rename, delete via the UI). Edits made outside vIDE —
// a file created in Finder, `git checkout` in an external terminal, a build
// script writing output — never trigger a refresh, so the tree silently goes
// stale. Watching the project root and pushing a debounced "something
// changed" event lets the renderer re-sync regardless of where the change
// came from, mirroring GitWatcher's approach for .git internals.
export class FileWatcher {
  private byWindow = new Map<number, WindowState>()

  registerHandlers(): void {
    ipcMain.on('fs:watchRoot', (event, cwd: string | null) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      if (cwd) this.watchRoot(win, cwd)
      else this.stop(win.id)
    })
  }

  private watchRoot(win: BrowserWindow, cwd: string): void {
    const state = this.stateFor(win.id)
    if (state.cwd === cwd && state.watcher) return
    this.stop(win.id)

    const freshState = this.stateFor(win.id)
    freshState.cwd = cwd
    freshState.watcher = watch(cwd, {
      ignoreInitial: true,
      ignored: (path: string) => IGNORED_SEGMENTS.some((seg) => path.includes(`/${seg}/`) || path.endsWith(`/${seg}`)),
    })
    freshState.watcher.on('all', () => this.notifyChanged(win, cwd))
    freshState.watcher.on('error', (err) => console.error('FileWatcher error:', err))
  }

  private notifyChanged(win: BrowserWindow, cwd: string): void {
    const state = this.stateFor(win.id)
    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('fs:changed', cwd)
    }, 300)
  }

  private stateFor(winId: number): WindowState {
    let state = this.byWindow.get(winId)
    if (!state) {
      state = { watcher: null, debounceTimer: null, cwd: null }
      this.byWindow.set(winId, state)
    }
    return state
  }

  private stop(winId: number): void {
    const state = this.byWindow.get(winId)
    if (!state) return
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }
    state.watcher?.close()
    state.watcher = null
    state.cwd = null
  }

  disposeWindow(winId: number): void {
    this.stop(winId)
    this.byWindow.delete(winId)
  }
}
