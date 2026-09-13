const SYSTEM_PROMPT = `You are a code-editing assistant embedded in a code editor. You will be given the code immediately before the target region (<prefix>), the code currently selected within that region (<selection>, which may be empty), the code immediately after it (<suffix>), and an instruction describing the change to make. Respond with ONLY the replacement code — if <selection> is non-empty, respond with the code that should replace it; if <selection> is empty, respond with the code that should be inserted at the cursor. No explanations, no markdown code fences, no repeating unrelated surrounding code.`

export function buildEditSystemPrompt(): string {
  return SYSTEM_PROMPT
}

export function buildEditPrompt(
  prefix: string,
  suffix: string,
  selection: string,
  instruction: string,
  language: string
): string {
  return `Language: ${language}\n<prefix>\n${prefix}\n</prefix>\n<selection>\n${selection}\n</selection>\n<suffix>\n${suffix}\n</suffix>\n\nInstruction: ${instruction}`
}

export type StreamLineEvent =
  | { type: 'delta'; text: string }
  | { type: 'result'; isError: boolean }

export function parseStreamJsonLine(line: string): StreamLineEvent | null {
  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }

  if (!obj || typeof obj !== 'object') return null
  const record = obj as Record<string, unknown>

  if (record.type === 'stream_event') {
    const event = record.event as Record<string, unknown> | undefined
    const delta = event?.delta as Record<string, unknown> | undefined
    if (event?.type === 'content_block_delta' && delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return { type: 'delta', text: delta.text }
    }
    return null
  }

  if (record.type === 'result') {
    return { type: 'result', isError: record.is_error === true }
  }

  return null
}

import { BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'
import { resolveClaudePath } from './autocomplete'

const TIMEOUT_MS = 30000

export interface InlineEditStartPayload {
  requestId: string
  prefix: string
  suffix: string
  selection: string
  instruction: string
  language: string
  model: string
}

export type InlineEditEvent =
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; message: string }

interface WindowState {
  proc: ChildProcessByStdio<null, Readable, Readable> | null
  suppressReporting: () => void
}

export class InlineEditManager {
  private currentByWindow = new Map<number, WindowState>()

  registerHandlers(): void {
    resolveClaudePath()

    ipcMain.on('inlineEdit:start', (event, payload: InlineEditStartPayload) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.start(win, payload)
    })

    ipcMain.on('inlineEdit:cancel', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.cancel(win)
    })
  }

  disposeWindow(windowId: number): void {
    this.cancelWindow(windowId)
  }

  // Public wrapper mirroring the ipcMain.on('inlineEdit:cancel', ...) closure
  // body above, so the mobile relay (inlineEditChannels.ts) can cancel a
  // mobile-originated edit the same way, keyed off the same sentinel window
  // the relay uses for term/claude/autocomplete sessions.
  cancel(win: BrowserWindow): void {
    this.cancelWindow(win.id)
  }

  private cancelWindow(windowId: number): void {
    const state = this.currentByWindow.get(windowId)
    if (!state) return
    state.suppressReporting()
    state.proc?.kill()
    this.currentByWindow.delete(windowId)
  }

  async start(win: BrowserWindow, payload: InlineEditStartPayload): Promise<void> {
    this.cancelWindow(win.id)

    // Reserve this window's slot synchronously, before the only await below —
    // otherwise a second start() call arriving during that await would find
    // nothing in currentByWindow to supersede (cancelWindow only cancels an
    // already-registered entry), and both requests could end up spawning live
    // processes for the same window.
    let superseded = false
    this.currentByWindow.set(win.id, { proc: null, suppressReporting: () => { superseded = true } })

    const claudePath = await resolveClaudePath()
    if (superseded) return

    if (!claudePath) {
      this.currentByWindow.delete(win.id)
      if (!win.isDestroyed()) {
        win.webContents.send('inlineEdit:event', { type: 'error', requestId: payload.requestId, message: 'claude CLI not found' } satisfies InlineEditEvent)
      }
      return
    }

    try {
      const proc = spawn(
        claudePath,
        [
          '-p', buildEditPrompt(payload.prefix, payload.suffix, payload.selection, payload.instruction, payload.language),
          '--model', payload.model,
          '--output-format', 'stream-json',
          '--include-partial-messages',
          '--verbose',
          '--no-session-persistence',
          '--tools', '',
          '--setting-sources', '',
          '--system-prompt', buildEditSystemPrompt(),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )

      let reported = false

      const removeIfCurrent = () => {
        if (this.currentByWindow.get(win.id)?.proc === proc) this.currentByWindow.delete(win.id)
      }

      const reportDelta = (text: string) => {
        if (reported) return
        if (!win.isDestroyed()) win.webContents.send('inlineEdit:event', { type: 'delta', requestId: payload.requestId, text } satisfies InlineEditEvent)
      }
      const reportDone = () => {
        if (reported) return
        reported = true
        clearTimeout(timer)
        removeIfCurrent()
        if (!win.isDestroyed()) win.webContents.send('inlineEdit:event', { type: 'done', requestId: payload.requestId } satisfies InlineEditEvent)
      }
      const reportError = (message: string) => {
        if (reported) return
        reported = true
        clearTimeout(timer)
        removeIfCurrent()
        if (!win.isDestroyed()) win.webContents.send('inlineEdit:event', { type: 'error', requestId: payload.requestId, message } satisfies InlineEditEvent)
      }
      const suppressReporting = () => {
        reported = true
        clearTimeout(timer)
        removeIfCurrent()
      }

      this.currentByWindow.set(win.id, { proc, suppressReporting })

      // An idle timeout, not a hard wall-clock: armTimer() is re-called on
      // every genuine delta, so the timer only fires after a real stall. If
      // no delta ever arrives, only the initial armTimer() call below runs,
      // so a fully silent process still times out at exactly TIMEOUT_MS from
      // spawn (matching the existing "no response" behavior/tests).
      let timer: ReturnType<typeof setTimeout>
      const armTimer = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          // Report before killing (not after): a real child's 'close' event
          // is always asynchronous, so production behavior is unaffected —
          // but killing first would let a test double with a synchronous
          // kill() (emitting 'close' inline) win the `reported` race with
          // "Something went wrong" instead of the correct "Timed out".
          reportError('Timed out')
          proc.kill()
        }, TIMEOUT_MS)
      }
      armTimer()

      // String mode (rather than decoding each Buffer chunk independently)
      // lets Node's internal StringDecoder correctly hold partial multi-byte
      // UTF-8 sequences that land on a chunk boundary, instead of corrupting
      // them.
      proc.stdout.setEncoding('utf8')
      // stderr is piped but intentionally unused; draining it without
      // inspecting its content prevents the OS pipe buffer from filling and
      // blocking the child process on write (more likely here than in
      // AutocompleteManager since --verbose materially increases stderr
      // volume) — an unread-but-piped stderr can otherwise silently degrade
      // into a misleading "Timed out" once the buffer fills.
      proc.stderr.resume()

      let buffer = ''
      let sawError = false

      proc.stdout.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const parsed = parseStreamJsonLine(line)
          if (parsed?.type === 'delta') {
            reportDelta(parsed.text)
            armTimer()
          } else if (parsed?.type === 'result' && parsed.isError) {
            sawError = true
          }
        }
      })

      proc.on('error', () => reportError('Failed to start claude'))
      proc.on('close', (code) => {
        if (code !== 0 || sawError) reportError('Something went wrong')
        else reportDone()
      })
    } catch {
      this.currentByWindow.delete(win.id)
      if (!win.isDestroyed()) {
        win.webContents.send('inlineEdit:event', { type: 'error', requestId: payload.requestId, message: 'Failed to start claude' } satisfies InlineEditEvent)
      }
    }
  }
}
