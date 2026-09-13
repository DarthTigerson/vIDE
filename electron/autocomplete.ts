const SYSTEM_PROMPT = `You are a code-completion engine embedded in a code editor. You will be given the code immediately before the cursor (<prefix>) and immediately after the cursor (<suffix>). Respond with ONLY the exact text that should be inserted at the cursor to continue the code naturally — no explanations, no markdown code fences, no repeating text that already appears in the prefix or suffix. If no reasonable completion exists, respond with nothing.`

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT
}

export function buildUserPrompt(prefix: string, suffix: string, language: string): string {
  return `Language: ${language}\n<prefix>\n${prefix}\n</prefix>\n<suffix>\n${suffix}\n</suffix>`
}

// A well-behaved single completion should never be this long; treat an
// over-long response as a failed completion rather than truncate mid-token
// (which could produce broken code). Matches the spirit of the prefix/suffix
// caps (4000/2000 chars) already enforced elsewhere in this codebase.
const MAX_COMPLETION_LENGTH = 2000

// Strips only the "noise" prefix the model sometimes emits before real
// content: a run of blank lines (whitespace-then-newline) at the very start.
// Leading spaces/tabs that indent the first real line of code are preserved,
// since Monaco inserts insertText literally at the cursor — stripping them
// would glue multi-line completions onto the current line.
function stripLeadingBlankPrefix(text: string): string {
  const leading = text.match(/^\s*/)?.[0] ?? ''
  const lastNewline = leading.lastIndexOf('\n')
  // No newline in the leading run means it's incidental whitespace on what's
  // meant to be the first line (not a meaningful blank-line separator) — drop it.
  if (lastNewline === -1) return text.slice(leading.length)
  return leading.slice(lastNewline + 1) + text.slice(leading.length)
}

export function postProcessCompletion(raw: string): string | null {
  let text = stripLeadingBlankPrefix(raw).replace(/\s+$/, '')
  if (!text) return null

  // Find a fenced code block anywhere in the response (not only when the
  // entire response is one fence) and prefer its contents over any
  // surrounding prose ("Here's the completion:\n```ts\n...\n```").
  const fenced = text.match(/```[a-zA-Z0-9]*\n([\s\S]*?)\n?```/)
  if (fenced) text = fenced[1].trim()

  if (!text) return null
  if (text.length > MAX_COMPLETION_LENGTH) return null

  return text
}

import { BrowserWindow, ipcMain } from 'electron'
import { execFile, spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable, Writable } from 'stream'

const TIMEOUT_MS = 15000

// Electron-launched apps on macOS don't inherit the interactive shell's PATH,
// so a bare spawn('claude', ...) fails whenever the CLI lives outside the
// default system PATH (e.g. ~/.local/bin, nvm — exactly how it's installed
// here). Resolve the absolute path once via a login shell and cache it, then
// spawn that path directly for every real completion request: this avoids
// paying a login shell's startup cost on every keystroke, and avoids ever
// shell-interpreting the prompt content (arbitrary user code) on every call.
let cachedClaudePath: string | null | undefined
// Caches the in-flight resolution promise (not just the final value) so that
// two managers prewarming this at app startup back-to-back (AutocompleteManager
// and InlineEditManager, both calling this fire-and-forget in registerHandlers())
// share a single login-shell resolution instead of each spawning their own
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
      console.error('[autocomplete] failed to resolve claude CLI path via login shell:', err ?? `unexpected output: ${JSON.stringify(stdout)}`)
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

export class AutocompleteManager {
  private currentByWindow = new Map<number, ChildProcessByStdio<Writable, Readable, Readable>>()

  registerHandlers(): void {
    resolveClaudePath()

    ipcMain.handle(
      'autocomplete:complete',
      (event, prefix: string, suffix: string, language: string, model: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return Promise.resolve(null)
        return this.complete(win.id, prefix, suffix, language, model)
      }
    )
  }

  disposeWindow(windowId: number): void {
    this.currentByWindow.get(windowId)?.kill()
    this.currentByWindow.delete(windowId)
  }

  async complete(
    windowId: number,
    prefix: string,
    suffix: string,
    language: string,
    model: string
  ): Promise<string | null> {
    this.currentByWindow.get(windowId)?.kill()

    const claudePath = await resolveClaudePath()
    if (!claudePath) return null

    return new Promise((resolve) => {
      // spawn() can throw synchronously in real conditions (e.g. argv
      // containing a null byte, which can happen if a user's file contains
      // one and it ends up in the prefix/suffix). Left uncaught, that throw
      // inside the executor rejects this Promise, which rejects
      // ipcMain.handle's promise, which Electron logs to the main-process
      // console — violating the "errors resolve null silently" requirement.
      try {
        const proc = spawn(
          claudePath,
          [
            '-p', buildUserPrompt(prefix, suffix, language),
            '--model', model,
            '--output-format', 'text',
            '--no-session-persistence',
            '--tools', '',
            '--setting-sources', '',
            '--system-prompt', buildSystemPrompt(),
          ],
          // stdin must be a real pipe that's explicitly closed, not 'ignore'.
          // The CLI blocks waiting to see whether stdin has data; 'ignore'
          // never delivers the EOF it's watching for, so the process hangs
          // past the 15s timeout above on every single request instead of
          // ever completing.
          { stdio: ['pipe', 'pipe', 'pipe'] }
        )
        proc.stdin.end()

        this.currentByWindow.set(windowId, proc)

        let stdout = ''
        let settled = false

        const finish = (result: string | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (this.currentByWindow.get(windowId) === proc) this.currentByWindow.delete(windowId)
          resolve(result)
        }

        const timer = setTimeout(() => {
          proc.kill()
          finish(null)
        }, TIMEOUT_MS)

        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
        proc.on('error', () => finish(null))
        proc.on('close', (code) => {
          if (code !== 0) { finish(null); return }
          finish(postProcessCompletion(stdout))
        })
      } catch {
        resolve(null)
      }
    })
  }
}
