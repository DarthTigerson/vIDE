import { open } from 'node:fs/promises'

// Turn-end detection for the done sound / speaking mode. Claude Code runs Stop
// hooks when the main agent finishes responding, with a JSON payload carrying
// transcript_path (and, on recent CLI versions, last_assistant_message). This
// hook saves that payload to a per-instance file named by VIDE_CLAUDE_STOP_FILE
// — the same env-var trick as the SessionStart restore hook, so the path never
// needs shell quoting — and ClaudeManager watches the file.
export const STOP_HOOK = { hooks: [{ type: 'command', command: 'cat > "$VIDE_CLAUDE_STOP_FILE"' }] }

// How much of the transcript's tail to read when the payload has no
// last_assistant_message. A turn's final text is near the end; tool output
// before it can be large, so this is generous but bounded.
const TAIL_BYTES = 512 * 1024

interface ContentBlock { type?: string; text?: string }
interface TranscriptEntry {
  type?: string
  message?: { role?: string; content?: string | ContentBlock[] }
}

function textOf(content: string | ContentBlock[] | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n')
}

// A user entry that is a real prompt (not a tool_result fed back to the model)
// marks the start of the current turn.
function isUserPrompt(entry: TranscriptEntry): boolean {
  if (entry.type !== 'user') return false
  const content = entry.message?.content
  if (typeof content === 'string') return true
  return Array.isArray(content) && content.some((b) => b?.type === 'text')
}

// The last text the assistant wrote in the most recent turn, from transcript
// JSONL lines (oldest first). Empty when the turn had no text (tools only).
export function lastAssistantText(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue // a partial first line from the tail read, or junk
    }
    if (isUserPrompt(entry)) return ''
    if (entry.type === 'assistant') {
      const text = textOf(entry.message?.content).trim()
      if (text) return text
    }
  }
  return ''
}

async function readTail(path: string): Promise<string[]> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - TAIL_BYTES)
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    return buffer.toString('utf8').split('\n').filter((l) => l.trim())
  } finally {
    await handle.close()
  }
}

// The reply text for a Stop hook payload: last_assistant_message when the CLI
// sends it, else the transcript's last assistant text. Never throws.
export async function replyTextFromStopPayload(raw: string, readLines: (path: string) => Promise<string[]> = readTail): Promise<string> {
  let payload: { last_assistant_message?: unknown; transcript_path?: unknown }
  try {
    payload = JSON.parse(raw)
  } catch {
    return ''
  }
  if (typeof payload.last_assistant_message === 'string' && payload.last_assistant_message.trim()) {
    return payload.last_assistant_message.trim()
  }
  if (typeof payload.transcript_path !== 'string') return ''
  try {
    return lastAssistantText(await readLines(payload.transcript_path))
  } catch {
    return ''
  }
}
