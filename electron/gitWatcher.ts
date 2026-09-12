import { BrowserWindow, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import { existsSync } from 'fs'
import { join } from 'path'
import { getMobileBroadcaster } from './mobile'

interface WindowState {
  watcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  cwd: string | null
}

// Renderer only learns about git state changes it caused itself (staging,
// committing, etc. through the UI) or on window focus. Commands run directly
// in the integrated terminal (checkout, commit, pull, merge...) never trigger
// either path, so the status bar goes stale. Watching the handful of files
// git itself mutates on any state change lets us push a refresh regardless of
// where the command came from.
export class GitWatcher {
  private byWindow = new Map<number, WindowState>()

  registerHandlers(): void {
    ipcMain.on('git:watchRoot', (event, cwd: string | null) => {
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

    const gitDir = join(cwd, '.git')
    if (!existsSync(gitDir)) return

    const freshState = this.stateFor(win.id)
    freshState.cwd = cwd
    freshState.watcher = watch(
      [
        join(gitDir, 'HEAD'),
        join(gitDir, 'MERGE_HEAD'),
        join(gitDir, 'index'),
        join(gitDir, 'packed-refs'),
        join(gitDir, 'refs'),
      ],
      { ignoreInitial: true, depth: 5 }
    )
    freshState.watcher.on('all', () => this.notifyChanged(win, cwd))
    freshState.watcher.on('error', (err) => console.error('GitWatcher error:', err))
  }

  private notifyChanged(win: BrowserWindow, cwd: string): void {
    const state = this.stateFor(win.id)
    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('git:changed', cwd)
      getMobileBroadcaster().emit('git:changed', cwd)
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
