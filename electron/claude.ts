import { BrowserWindow, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getMobileBroadcaster } from './mobile'
import { ROCKY_FLAGS, rockySpawnEnv } from './rocky'

type SessionMode = 'attach' | 'new' | 'continue' | 'resume'

const COMMANDS: Record<Exclude<SessionMode, 'attach'>, string> = {
  new: 'claude',
  continue: 'claude --continue',
  resume: 'claude --resume',
}

const INSTALL_MESSAGE = "Install it with: npm install -g @anthropic-ai/claude-code"

// Session restore: Claude Code runs SessionStart hooks on startup, /resume,
// /clear and compact, with a JSON payload carrying the current session_id
// and transcript_path. This hook (merged with the user's own hooks, not
// replacing them) saves that payload to a per-instance file named by the
// VIDE_CLAUDE_SESSION_FILE env var, so a restored instance can be respawned
// with `claude --resume <id>` instead of starting a new conversation. The
// path travels via env rather than being baked into this JSON so it never
// needs shell quoting (userData lives under "Application Support").
const SESSION_HOOK_SETTINGS = JSON.stringify({
  hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'cat > "$VIDE_CLAUDE_SESSION_FILE"' }] }] },
})

// Instance ids become filenames and session ids go into the shell command,
// so both must be plain ids (UUIDs in practice).
const SAFE_ID = /^[A-Za-z0-9-]+$/

// `claude --resume <id>` for the conversation this instance last had, or
// plain `claude` if none was recorded or its transcript is gone (e.g. a
// /clear that never got a message, or transcript saving turned off).
function restoreCommand(sessionFile: string): string {
  try {
    const { session_id, transcript_path } = JSON.parse(readFileSync(sessionFile, 'utf8'))
    if (
      typeof session_id === 'string' && SAFE_ID.test(session_id) &&
      typeof transcript_path === 'string' && existsSync(transcript_path)
    ) {
      return `claude --resume ${session_id}`
    }
  } catch {
    // missing or unreadable record — fall through to a fresh session
  }
  return COMMANDS.new
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

interface InstanceState {
  proc?: pty.IPty
  cwd?: string
  lastInputAt: number
  busy: boolean
  busyTimer?: NodeJS.Timeout
  // Non-echo output chunks seen since this instance went busy — reset each
  // time a fresh episode starts. A single incidental redraw (a resize
  // repaint, say) is ~1 chunk; real generation streams many. Reported
  // alongside the busy=false event so consumers (the completion-sound
  // wiring in App.tsx) can tell genuine turns from output blips without
  // relying on timing, which can't reliably distinguish the two (VIDE-59).
  busyChunkCount: number
}

interface WindowState {
  instances: Map<string, InstanceState>
}

interface BrowserBridgeLike {
  getSpawnEnv(windowId: number): Record<string, string>
}

function newInstanceState(): InstanceState {
  return { lastInputAt: 0, busy: false, busyChunkCount: 0 }
}

export class ClaudeManager {
  private byWindow = new Map<number, WindowState>()

  // sessionDir enables session restore (see SESSION_HOOK_SETTINGS); without
  // it every spawn behaves exactly as before.
  constructor(private browserBridge?: BrowserBridgeLike, private sessionDir?: string) {
    if (sessionDir) mkdirSync(sessionDir, { recursive: true })
  }

  registerHandlers(): void {
    ipcMain.handle('claude:spawn', (event, cwd: string, instanceId: string, mode: SessionMode = 'attach', kind?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.spawn(win, cwd, instanceId, mode, kind)
    })

    ipcMain.on('claude:write', (event, instanceId: string, data: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.write(win, instanceId, data)
    })

    ipcMain.on('claude:resize', (event, instanceId: string, cols: number, rows: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.resize(win, instanceId, cols, rows)
    })

    ipcMain.on('claude:kill', (event, instanceId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) this.kill(win, instanceId)
    })
  }

  // `kind` is the renderer's AssistantKind; 'rocky' (Rocky Code, VIDE-108)
  // is the same CLI plus ROCKY_FLAGS, on every mode including restore.
  spawn(win: BrowserWindow, cwd: string, instanceId: string, mode: SessionMode = 'attach', kind?: string): void {
    const rocky = kind === 'rocky'
    const state = this.stateFor(win.id)
    const inst = state.instances.get(instanceId) ?? newInstanceState()
    state.instances.set(instanceId, inst)
    const selectedMode = mode === 'continue' || mode === 'new' || mode === 'resume' ? mode : 'attach'

    const attachingToSameCwd = inst.proc && inst.cwd === cwd
    if (selectedMode === 'attach' && attachingToSameCwd) return

    inst.proc?.kill()
    inst.proc = undefined
    inst.cwd = undefined

    try {
      const shell = process.env.SHELL ?? '/bin/zsh'
      // Lets a login flow's `open`/`xdg-open` call route into vIDE's own
      // Browser panel (VIDE-7) instead of escaping to the OS browser.
      // Every instance managed here is a Claude instance, so this applies
      // unconditionally now.
      const shimEnv = this.browserBridge?.getSpawnEnv(win.id)
      // `-lic` makes this a login shell, which re-derives PATH from scratch
      // via macOS's path_helper — clobbering anything we set in `env`
      // before the shell body runs, so /usr/bin/open would always win over
      // our shim dir if we relied on the env var alone. Re-exporting PATH
      // here, inside the command string, runs after that clobbering.
      const sessionFile =
        this.sessionDir && SAFE_ID.test(instanceId) ? join(this.sessionDir, `${instanceId}.json`) : undefined
      // A plain attach with no live process is a restore (app relaunch or
      // switching back to this project) — pick up where the instance left off.
      let baseCommand =
        selectedMode === 'attach' && sessionFile ? restoreCommand(sessionFile) : COMMANDS[selectedMode === 'attach' ? 'new' : selectedMode]
      if (sessionFile) baseCommand += ` --settings '${SESSION_HOOK_SETTINGS}'`
      if (rocky) baseCommand += ` ${ROCKY_FLAGS}`
      const command = shimEnv ? `export PATH="${shimEnv.VIDE_BROWSER_SHIM_BIN}:$PATH"; ${baseCommand}` : baseCommand
      const proc = pty.spawn(shell, ['-lic', command], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd,
        env: {
          ...(process.env as Record<string, string>),
          ...shimEnv,
          ...(sessionFile ? { VIDE_CLAUDE_SESSION_FILE: sessionFile } : {}),
          ...(rocky ? rockySpawnEnv() : {}),
        },
      })
      inst.proc = proc
      inst.cwd = cwd
      proc.onData((data) => {
        if (!win.isDestroyed()) win.webContents.send('claude:data', instanceId, data)
        getMobileBroadcaster().emit('claude:data', instanceId, data)

        const now = Date.now()
        const sinceInput = now - inst.lastInputAt
        if (sinceInput <= ECHO_WINDOW_MS) return // likely an echo of our own input, not real activity

        if (!inst.busy) inst.busyChunkCount = 0
        inst.busyChunkCount += 1

        this.setBusy(win, inst, instanceId, true)
        clearTimeout(inst.busyTimer)
        inst.busyTimer = setTimeout(() => {
          this.setBusy(win, inst, instanceId, false)
        }, IDLE_TIMEOUT_MS)
      })
      proc.onExit(() => {
        if (inst.proc === proc) {
          inst.proc = undefined
          inst.cwd = undefined
        }
        clearTimeout(inst.busyTimer)
        inst.busyTimer = undefined
        this.setBusy(win, inst, instanceId, false)
      })
    } catch {
      const errorMessage = `\r\nError: 'claude' not found in PATH.\r\n${INSTALL_MESSAGE}\r\n`
      if (!win.isDestroyed()) win.webContents.send('claude:data', instanceId, errorMessage)
      getMobileBroadcaster().emit('claude:data', instanceId, errorMessage)
    }
  }

  write(win: BrowserWindow, instanceId: string, data: string): void {
    const inst = this.stateFor(win.id).instances.get(instanceId)
    if (!inst) return
    inst.lastInputAt = Date.now()
    inst.proc?.write(data)
  }

  resize(win: BrowserWindow, instanceId: string, cols: number, rows: number): void {
    if (!hasValidSize(cols, rows)) return
    this.stateFor(win.id).instances.get(instanceId)?.proc?.resize(Math.floor(cols), Math.floor(rows))
  }

  kill(win: BrowserWindow, instanceId: string): void {
    const state = this.stateFor(win.id)
    const inst = state.instances.get(instanceId)
    if (!inst) return
    clearTimeout(inst.busyTimer)
    inst.proc?.kill()
    state.instances.delete(instanceId)
  }

  private setBusy(win: BrowserWindow, inst: InstanceState, instanceId: string, busy: boolean): void {
    if (inst.busy === busy) return
    inst.busy = busy
    if (!win.isDestroyed()) win.webContents.send('claude:busy', instanceId, busy, inst.busyChunkCount)
    getMobileBroadcaster().emit('claude:busy', instanceId, busy, inst.busyChunkCount)
  }

  private stateFor(winId: number): WindowState {
    let state = this.byWindow.get(winId)
    if (!state) {
      state = { instances: new Map() }
      this.byWindow.set(winId, state)
    }
    return state
  }

  disposeWindow(winId: number): void {
    const state = this.byWindow.get(winId)
    if (!state) return
    for (const inst of state.instances.values()) {
      clearTimeout(inst.busyTimer)
      inst.proc?.kill()
    }
    this.byWindow.delete(winId)
  }
}
