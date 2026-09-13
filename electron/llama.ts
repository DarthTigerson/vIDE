import { ipcMain } from 'electron'
import { spawn, execFile } from 'child_process'

// llama.cpp ships several binaries; `llama-server` is the one that hosts the
// OpenAI-compatible API (what vIDE's model launch flow will talk to), so it
// is the primary availability probe. `llama-cli` is probed as a fallback for
// older llama.cpp releases that predate the standalone server binary.
const LLAMA_BINARIES = ['llama-server', 'llama-cli']

// Electron-launched apps (Finder/Dock, not `npm run dev` from a terminal)
// don't inherit the interactive shell's PATH, so a bare spawn('llama-server',
// ...) fails whenever the binary lives outside the default system PATH (e.g.
// a Homebrew install in a cell, or a build in ~/bin). Mirrors
// resolveGraphifyPath() in electron/graphify.ts: resolve the absolute path
// once via a login shell and cache it.
let cachedLlamaPath: string | null | undefined
let pendingLlamaPathResolution: Promise<string | null> | undefined

export function resolveLlamaPath(): Promise<string | null> {
  if (cachedLlamaPath !== undefined) return Promise.resolve(cachedLlamaPath)
  if (pendingLlamaPathResolution) return pendingLlamaPathResolution

  pendingLlamaPathResolution = new Promise<string | null>((resolve) => {
    const shell = process.env.SHELL ?? '/bin/zsh'
    // Probe both binaries in one login-shell call so a single resolution
    // pass finds whichever llama.cpp version the user has installed.
    execFile(shell, ['-lic', `command -v ${LLAMA_BINARIES[0]} || command -v ${LLAMA_BINARIES[1]}`], (err, stdout) => {
      // `-lic` runs an interactive login shell, which sources .zshrc/.zprofile
      // and can prepend banners or version-manager output to stdout. Take the
      // last non-empty line rather than the whole trimmed output, and require
      // it to look like an absolute path.
      const lines = (stdout ? stdout.toString() : '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      const lastLine = lines[lines.length - 1]
      const resolved = !err && lastLine && lastLine.startsWith('/') ? lastLine : null

      if (resolved) {
        // Only cache successes — caching a failure would silently disable the
        // absolute-path resolution for the rest of the app session on a
        // transient hiccup (shell not ready yet, PATH not sourced yet, etc.).
        cachedLlamaPath = resolved
        resolve(resolved)
        return
      }

      console.error('[llama] failed to resolve llama.cpp binary path via login shell:', err ?? `unexpected output: ${JSON.stringify(stdout)}`)
      resolve(null)
    })
  })

  pendingLlamaPathResolution.finally(() => {
    pendingLlamaPathResolution = undefined
  })

  return pendingLlamaPathResolution
}

export function _resetLlamaPathCacheForTesting(): void {
  cachedLlamaPath = undefined
  pendingLlamaPathResolution = undefined
}

export class LlamaManager {
  registerHandlers(): void {
    // Prewarm the login-shell resolution at startup so it's usually already
    // cached by the time the Llama panel first mounts.
    resolveLlamaPath()

    ipcMain.handle('llama:isAvailable', () => this.checkAvailable())
  }

  private async checkAvailable(): Promise<boolean> {
    const bin = (await resolveLlamaPath()) ?? LLAMA_BINARIES[0]
    return new Promise((resolve) => {
      const proc = spawn(bin, ['--help'], { stdio: 'ignore' })
      proc.on('spawn', () => resolve(true))
      proc.on('error', () => resolve(false))
    })
  }
}
