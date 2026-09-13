// Styled after this repo's own commit history (see `git log`): short, plain,
// present/past-tense descriptions — no Conventional Commits type prefixes,
// no trailing period, one line.
export const DEFAULT_COMMIT_PROMPT =
  'Write a single-line git commit message summarizing this diff, in the style of a short, plain, imperative or past-tense description (e.g. "Added editor commands to command palette", "fixed discard panel") — no type prefixes like feat:/fix:, no trailing period, no markdown, no explanation. Respond with ONLY the commit message.'

export function buildCommitMessagePrompt(diff: string, customInstruction: string): string {
  const instruction = customInstruction.trim() || DEFAULT_COMMIT_PROMPT
  return `${instruction}\n\n<diff>\n${diff}\n</diff>`
}

export function postProcessCommitMessage(raw: string): string | null {
  let text = raw.trim()
  if (!text) return null

  const fenced = text.match(/```[a-zA-Z0-9]*\n?([\s\S]*?)\n?```/)
  if (fenced) text = fenced[1].trim()

  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }

  return text || null
}

import { BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable, Writable } from 'stream'
import { resolveClaudePath } from './autocomplete'

const TIMEOUT_MS = 30000

export class CommitMessageManager {
  private currentByWindow = new Map<number, ChildProcessByStdio<Writable, Readable, Readable>>()

  registerHandlers(): void {
    ipcMain.handle(
      'commitMessage:generate',
      (event, diff: string, model: string, customPrompt: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return Promise.resolve(null)
        return this.generate(win.id, diff, model, customPrompt)
      }
    )
  }

  disposeWindow(windowId: number): void {
    this.currentByWindow.get(windowId)?.kill()
    this.currentByWindow.delete(windowId)
  }

  async generate(
    windowId: number,
    diff: string,
    model: string,
    customPrompt: string
  ): Promise<string | null> {
    this.currentByWindow.get(windowId)?.kill()

    if (!diff.trim()) return null

    const claudePath = await resolveClaudePath()
    if (!claudePath) return null

    return new Promise((resolve) => {
      try {
        const proc = spawn(
          claudePath,
          [
            '-p', buildCommitMessagePrompt(diff, customPrompt),
            '--model', model,
            '--output-format', 'text',
            '--no-session-persistence',
            '--tools', '',
            '--setting-sources', '',
          ],
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
          finish(postProcessCommitMessage(stdout))
        })
      } catch {
        resolve(null)
      }
    })
  }
}
