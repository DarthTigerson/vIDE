import { BrowserWindow, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { platform } from 'os'
import { getMobileBroadcaster } from './mobile'

const shell =
  platform() === 'win32'
    ? 'powershell.exe'
    : process.env.SHELL ?? '/bin/zsh'

function hasValidSize(cols: number, rows: number): boolean {
  return Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0
}

interface WindowState {
  procs: Map<string, pty.IPty>
  killedIds: Set<string> // tracks intentional kills
}

export class PtyManager {
  private byWindow = new Map<number, WindowState>()

  registerHandlers(): void {
    ipcMain.handle('term:spawn', (event, id: string, cwd?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.spawn(win, id, cwd)
    })

    ipcMain.handle('term:kill', (event, id: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.kill(win, id)
    })

    ipcMain.on('term:write', (event, id: string, data: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.write(win, id, data)
    })

    ipcMain.on('term:resize', (event, id: string, cols: number, rows: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.resize(win, id, cols, rows)
    })
  }

  spawn(win: BrowserWindow, id: string, cwd?: string): void {
    const state = this.stateFor(win.id)
    if (state.procs.has(id)) return

    // Electron's own process env sometimes carries an EDITOR/VISUAL set by
    // whatever dev tooling launched it (e.g. "vi"), not by the user's shell
    // profile. zsh auto-switches its line editor into vi mode whenever
    // $VISUAL/$EDITOR ends in "vi", which silently drops the emacs-style
    // bindings readline users expect (Ctrl+R history search, Ctrl+A/E
    // line navigation — Ctrl+C still works since SIGINT is a TTY signal,
    // not a keymap binding). Stripping these lets the shell fall back to
    // its normal interactive default instead of inheriting Electron's.
    const env = { ...(process.env as Record<string, string>) }
    delete env.EDITOR
    delete env.VISUAL
    const proc = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd ?? process.env.HOME,
      env,
    })
    state.procs.set(id, proc)
    proc.onData((data) => {
      if (!win.isDestroyed()) win.webContents.send('term:data', id, data)
      getMobileBroadcaster().emit('term:data', id, data)
    })
    proc.onExit(() => {
      if (state.killedIds.has(id)) {
        state.killedIds.delete(id) // intentional kill — no notification
        return
      }
      state.procs.delete(id)
      if (!win.isDestroyed()) win.webContents.send('term:exit', id)
      getMobileBroadcaster().emit('term:exit', id)
    })
  }

  kill(win: BrowserWindow, id: string): void {
    const state = this.stateFor(win.id)
    const proc = state.procs.get(id)
    if (!proc) return
    state.killedIds.add(id) // mark as intentional before kill fires onExit
    state.procs.delete(id)
    proc.kill()
  }

  write(win: BrowserWindow, id: string, data: string): void {
    this.stateFor(win.id).procs.get(id)?.write(data)
  }

  resize(win: BrowserWindow, id: string, cols: number, rows: number): void {
    if (!hasValidSize(cols, rows)) return
    this.stateFor(win.id).procs.get(id)?.resize(Math.floor(cols), Math.floor(rows))
  }

  private stateFor(winId: number): WindowState {
    let state = this.byWindow.get(winId)
    if (!state) {
      state = { procs: new Map(), killedIds: new Set() }
      this.byWindow.set(winId, state)
    }
    return state
  }

  disposeWindow(winId: number): void {
    const state = this.byWindow.get(winId)
    if (!state) return
    for (const proc of state.procs.values()) proc.kill()
    this.byWindow.delete(winId)
  }
}
