import { execFile } from 'child_process'

// Electron-launched apps on macOS don't inherit the interactive shell's PATH,
// so a bare spawn('claude', ...) fails whenever the CLI lives outside the
// default system PATH (e.g. ~/.local/bin, nvm — exactly how it's installed
// here). Resolve the absolute path once via a login shell and cache it, then
// spawn that path directly for every real completion request: this avoids
// paying a login shell's startup cost on every keystroke, and avoids ever
// shell-interpreting the prompt content (arbitrary user code) on every call.
let cachedClaudePath: string | null | undefined
// Caches the in-flight resolution promise (not just the final value) so that
// callers prewarming this at app startup back-to-back (InlineEditManager's
// registerHandlers(), the usage poller, commit messages) share a single login-shell resolution instead of each spawning their own
// concurrent `execFile($SHELL, ['-lic', ...])`.
let pendingClaudePathResolution: Promise<string | null> | undefined

export function resolveClaudePath(): Promise<string | null> {
  if (cachedClaudePath !== undefined) return Promise.resolve(cachedClaudePath)
  if (pendingClaudePathResolution) return pendingClaudePathResolution

  pendingClaudePathResolution = new Promise<string | null>((resolve) => {
    const shell = process.env.SHELL ?? '/bin/zsh'
    execFile(shell, ['-lic', 'command -v claude'], (err, stdout) => {
      // `-lic` runs an interactive login shell, which sources .zshrc/.zprofile
      // and can prepend banners or version-manager output (nvm, pyenv, ...) to
      // stdout. Take the last non-empty line rather than the whole trimmed
      // output, and require it to look like an absolute path.
      const lines = (stdout ? stdout.toString() : '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      const lastLine = lines[lines.length - 1]
      const resolved = !err && lastLine && lastLine.startsWith('/') ? lastLine : null

      if (resolved) {
        // Only cache successes. Caching a failure would silently disable the
        // feature for the rest of the app session on a transient hiccup
        // (shell not ready yet, PATH not sourced yet, etc.) with no retry.
        cachedClaudePath = resolved
        resolve(resolved)
        return
      }

      // Main-process-only diagnostic (never surfaced to the renderer/user) so
      // a real deployment issue is at least visible in the app's logs.
      console.error('[claude] failed to resolve claude CLI path via login shell:', err ?? `unexpected output: ${JSON.stringify(stdout)}`)
      resolve(null)
    })
  })

  // Clear the pending-promise cache once this resolution settles (success or
  // failure), via a .finally() microtask rather than synchronously inside
  // the execFile callback above. execFile's callback can in principle fire
  // synchronously (e.g. under a test double that invokes its callback
  // inline) — clearing there would race against the
  // `pendingClaudePathResolution = new Promise(...)` assignment still being
  // in progress on this line, and the outer assignment completing last would
  // silently undo the clear, leaving a stale resolved promise cached forever
  // (permanently short-circuiting retries on failure). Deferring to
  // .finally() guarantees this always runs after the assignment above,
  // regardless of callback timing.
  pendingClaudePathResolution.finally(() => {
    pendingClaudePathResolution = undefined
  })

  return pendingClaudePathResolution
}

export function _resetClaudePathCacheForTesting(): void {
  cachedClaudePath = undefined
  pendingClaudePathResolution = undefined
}
