import { BrowserWindow, ipcMain } from 'electron'
import * as pty from 'node-pty'

type AssistantKind = 'claude' | 'codex'
type SessionMode = 'attach' | 'new' | 'continue' | 'resume'

const COMMANDS: Record<AssistantKind, Record<Exclude<SessionMode, 'attach'>, string>> = {
  claude: {
    new: 'claude',
    continue: 'claude --continue',
    resume: 'claude --resume',
  },
  codex: {
    new: 'codex',
    continue: 'codex resume --last',
    resume: 'codex resume',
  },
}

const INSTALL_MESSAGES: Record<AssistantKind, string> = {
  claude: "Install it with: npm install -g @anthropic-ai/claude-code",
  codex: 'Install Codex CLI, then make sure `codex` is available in PATH.',
}

function hasValidSize(cols: number, rows: number): boolean {
  return Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0
}

// "Busy" detection for the animated status icon: the PTY's raw output stream
// can't distinguish the CLI's own generated output from it echoing the
// user's own keystrokes back to redraw its input box, so a naive "any output
// = busy" heuristic would show "busy" for the entire time the user is typing
// a prompt. Instead, output that arrives within ECHO_WINDOW_MS of our own
// last write to that pty is assumed to be an echo and ignored; output that
// arrives without a recent write behind it is real generation. Busy clears
// itself IDLE_TIMEOUT_MS after the last non-echo output, via a timer rather
// than polling, since "went idle" is a transition that happens purely from
// time passing with no new event to trigger it.
export const ECHO_WINDOW_MS = 400
export const IDLE_TIMEOUT_MS = 1500

interface WindowState {
  procs: Partial<Record<AssistantKind, pty.IPty>>
  procCwd: Partial<Record<AssistantKind, string>>
  activeAssistant: AssistantKind
  lastInputAt: Partial<Record<AssistantKind, number>>
  busy: Partial<Record<AssistantKind, boolean>>
  busyTimers: Partial<Record<AssistantKind, NodeJS.Timeout>>
}

interface BrowserOpenShimLike {
  getSpawnEnv(windowId: number): Record<string, string>
}

export class ClaudeManager {
  private byWindow = new Map<number, WindowState>()

  constructor(private browserOpenShim?: BrowserOpenShimLike) {}

  registerHandlers(): void {
    ipcMain.handle('assistant:spawn', (event, cwd: string, assistant: AssistantKind = 'claude', mode: SessionMode = 'attach') => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      const state = this.stateFor(win.id)
      const selectedAssistant = assistant === 'codex' ? 'codex' : 'claude'
      const selectedMode = mode === 'continue' || mode === 'new' || mode === 'resume' ? mode : 'attach'
      state.activeAssistant = selectedAssistant

      const attachingToSameCwd = state.procs[selectedAssistant] && state.procCwd[selectedAssistant] === cwd
      if (selectedMode === 'attach' && attachingToSameCwd) return

      state.procs[selectedAssistant]?.kill()
      delete state.procs[selectedAssistant]
      delete state.procCwd[selectedAssistant]

      try {
        const shell = process.env.SHELL ?? '/bin/zsh'
        // Only claude gets the browser-open shim env — it lets a login flow's
        // `open`/`xdg-open` call route into vIDE's own Browser panel (VIDE-7)
        // instead of escaping to the OS browser.
        const shimEnv = selectedAssistant === 'claude' ? this.browserOpenShim?.getSpawnEnv(win.id) : undefined
        // `-lic` makes this a login shell, which re-derives PATH from scratch
        // via macOS's path_helper — clobbering anything we set in `env`
        // before the shell body runs, so /usr/bin/open would always win over
        // our shim dir if we relied on the env var alone. Re-exporting PATH
        // here, inside the command string, runs after that clobbering.
        const baseCommand = COMMANDS[selectedAssistant][selectedMode === 'attach' ? 'new' : selectedMode]
        const command = shimEnv ? `export PATH="${shimEnv.VIDE_BROWSER_SHIM_BIN}:$PATH"; ${baseCommand}` : baseCommand
        const proc = pty.spawn(shell, ['-lic', command], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd,
          env: { ...(process.env as Record<string, string>), ...shimEnv },
        })
        state.procs[selectedAssistant] = proc
        state.procCwd[selectedAssistant] = cwd
        proc.onData((data) => {
          if (!win.isDestroyed()) win.webContents.send('assistant:data', selectedAssistant, data)

          const now = Date.now()
          const sinceInput = now - (state.lastInputAt[selectedAssistant] ?? 0)
          if (sinceInput <= ECHO_WINDOW_MS) return // likely an echo of our own input, not real activity

          this.setBusy(win, state, selectedAssistant, true)
          clearTimeout(state.busyTimers[selectedAssistant])
          state.busyTimers[selectedAssistant] = setTimeout(() => {
            this.setBusy(win, state, selectedAssistant, false)
          }, IDLE_TIMEOUT_MS)
        })
        proc.onExit(() => {
          if (state.procs[selectedAssistant] === proc) {
            delete state.procs[selectedAssistant]
            delete state.procCwd[selectedAssistant]
          }
          clearTimeout(state.busyTimers[selectedAssistant])
          delete state.busyTimers[selectedAssistant]
          this.setBusy(win, state, selectedAssistant, false)
        })
      } catch {
        if (!win.isDestroyed()) {
          win.webContents.send(
            'assistant:data',
            selectedAssistant,
            `\r\nError: '${selectedAssistant}' not found in PATH.\r\n${INSTALL_MESSAGES[selectedAssistant]}\r\n`
          )
        }
      }
    })

    ipcMain.on('assistant:write', (event, assistant: AssistantKind | undefined, data: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      const state = this.stateFor(win.id)
      const selectedAssistant = (assistant === 'codex' ? 'codex' : assistant === 'claude' ? 'claude' : state.activeAssistant)
      state.lastInputAt[selectedAssistant] = Date.now()
      state.procs[selectedAssistant]?.write(data)
    })

    ipcMain.on('assistant:resize', (event, assistant: AssistantKind | undefined, cols: number, rows: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win || !hasValidSize(cols, rows)) return
      const state = this.stateFor(win.id)
      const selectedAssistant = (assistant === 'codex' ? 'codex' : assistant === 'claude' ? 'claude' : state.activeAssistant)
      state.procs[selectedAssistant]?.resize(Math.floor(cols), Math.floor(rows))
    })
  }

  private setBusy(win: BrowserWindow, state: WindowState, assistant: AssistantKind, busy: boolean): void {
    if (state.busy[assistant] === busy) return
    state.busy[assistant] = busy
    if (!win.isDestroyed()) win.webContents.send('assistant:busy', assistant, busy)
  }

  private stateFor(winId: number): WindowState {
    let state = this.byWindow.get(winId)
    if (!state) {
      state = { procs: {}, procCwd: {}, activeAssistant: 'claude', lastInputAt: {}, busy: {}, busyTimers: {} }
      this.byWindow.set(winId, state)
    }
    return state
  }

  disposeWindow(winId: number): void {
    const state = this.byWindow.get(winId)
    if (!state) return
    Object.values(state.busyTimers).forEach((timer) => clearTimeout(timer))
    Object.values(state.procs).forEach((proc) => proc?.kill())
    this.byWindow.delete(winId)
  }
}
