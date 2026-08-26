import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'chokidar'

const DEBOUNCE_MS = 300

// The Todo MCP server (electron/mcp/todoMcpServer.ts) writes todos.json from
// a separate process, entirely outside the renderer's own IPC-driven update
// path — so an already-open Todo board has no other way to learn its data
// just changed underneath it. Broadcasts to every window rather than
// tracking "which board is open where": todos aren't scoped per-window the
// way a git repo is, so there's nothing more specific to target.
export class TodosWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  start(todosJsonPath: string): void {
    if (this.watcher) return
    this.watcher = watch(todosJsonPath, { ignoreInitial: true })
    this.watcher.on('all', () => this.notifyChanged())
    this.watcher.on('error', (err) => console.error('TodosWatcher error:', err))
  }

  private notifyChanged(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('todos:changed')
      }
    }, DEBOUNCE_MS)
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.watcher?.close()
    this.watcher = null
  }
}
