import { normalizeBody, scriptDisplayTitle } from './scriptsData'

// How `run_script` learns that a script finished, and with what exit status,
// without a second channel into the shell: one extra line after the body
// prints an OSC escape carrying `$?`. xterm ignores unknown OSC codes, so the
// user only sees the printf line echoed, never its output. The shell's echo
// of that line contains the *typed* `\033`, not a real ESC byte, so it can
// never be mistaken for the marker itself.
export const SCRIPT_MARKER_OSC = 6973
export const SCRIPT_RUN_TIMEOUT_MS = 10 * 60 * 1000
// A fresh shell prints its prompt within moments; silence this long means the
// terminal never spawned (window reloading, script missing in the renderer).
export const SCRIPT_START_TIMEOUT_MS = 20 * 1000
// Only the tail of a run is ever returned, so only a bounded tail is kept.
const MAX_RAW_CHARS = 256 * 1024
const MAX_LINES = 200
const MAX_CHARS = 32768

export type ScriptRunResult =
  | { status: 'done'; exitCode: number; output: string }
  | { status: 'timeout'; output: string }
  | { status: 'exited'; output: string }
  | { status: 'not-started' }

export function buildMarkedCommand(body: string, token: string): string {
  return normalizeBody(body) + `printf '\\033]${SCRIPT_MARKER_OSC};${token};%s\\007' "$?"\n`
}

function markerPattern(token: string): RegExp {
  return new RegExp(`\\x1b\\]${SCRIPT_MARKER_OSC};${escapeRegExp(token)};(\\d+)\\x07`)
}

export function findMarker(output: string, token: string): number | null {
  const match = markerPattern(token).exec(output)
  return match ? Number(match[1]) : null
}

export function cleanScriptOutput(raw: string, token: string): string {
  const echoedMarkerLine = `]${SCRIPT_MARKER_OSC};${token};%s`
  const text = raw
    .replace(new RegExp(markerPattern(token).source + '[\\s\\S]*$'), '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r\n/g, '\n')
  const lines = text
    .split('\n')
    // A bare \r redraws the line (progress bars); keep what ended up shown.
    .map((line) => line.slice(line.lastIndexOf('\r') + 1))
    .filter((line) => !line.includes(echoedMarkerLine))
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.slice(-MAX_LINES).join('\n').slice(-MAX_CHARS)
}

export function waitForScriptResult(opts: {
  subscribe: (onData: (data: string) => void, onExit: () => void) => () => void
  token: string
  timeoutMs: number
  startTimeoutMs?: number
}): Promise<ScriptRunResult> {
  return new Promise((resolve) => {
    let raw = ''
    let started = false
    let settled = false
    let unsubscribe: () => void = () => {}
    const finish = (result: ScriptRunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(startTimer)
      unsubscribe()
      resolve(result)
    }
    const timer = setTimeout(
      () => finish({ status: 'timeout', output: cleanScriptOutput(raw, opts.token) }),
      opts.timeoutMs,
    )
    const startTimer = setTimeout(() => {
      if (!started) finish({ status: 'not-started' })
    }, opts.startTimeoutMs ?? SCRIPT_START_TIMEOUT_MS)
    // Searching only the new data plus a short overlap keeps each chunk O(chunk)
    // — rescanning the whole run on every chunk froze the main process on
    // chatty scripts.
    const overlap = 64 + opts.token.length
    unsubscribe = opts.subscribe(
      (data) => {
        started = true
        const window = raw.slice(-overlap) + data
        raw = (raw + data).slice(-MAX_RAW_CHARS)
        const exitCode = findMarker(window, opts.token)
        if (exitCode !== null) finish({ status: 'done', exitCode, output: cleanScriptOutput(raw, opts.token) })
      },
      () => finish({ status: 'exited', output: cleanScriptOutput(raw, opts.token) }),
    )
    if (settled) unsubscribe()
  })
}

export function formatRunResult(script: { title: string; shareOutput: boolean }, result: ScriptRunResult): string {
  const title = scriptDisplayTitle(script)
  if (result.status === 'not-started') return `The terminal for "${title}" never started; nothing was run.`
  if (result.status === 'exited') return `The terminal running "${title}" closed before the script finished.`
  if (result.status === 'timeout') {
    const head = `Script "${title}" is still running in its terminal after 10 minutes; stopped waiting.`
    return script.shareOutput && result.output ? `${head}\n\nOutput so far:\n${result.output}` : head
  }
  const outcome = result.exitCode === 0 ? 'success' : 'failure'
  if (!script.shareOutput) {
    return `Script "${title}" finished: ${outcome} (exit code ${result.exitCode}). Output is hidden for this script — ask the user to check terminal "${title}" if you need details.`
  }
  return `Script "${title}" finished with exit code ${result.exitCode} (${outcome}).\n\nOutput:\n${result.output}`
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
