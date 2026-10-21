import type { BridgeMessage } from './bridge'

// Within one Bridge turn every tool round is resent in full: each read_file
// result and each create_file/write_file/edit_file body stays in the
// transcript until the turn ends, so a long agent run spends most of its
// prompt on file contents it has already acted on. This replaces those old
// payloads with a one-line stub the model can act on ("re-read if needed").
//
// Trimming rewrites earlier messages, which invalidates llama.cpp's prompt
// cache from that point on — so it runs in batches, only once enough is
// freeable to be worth one full re-process (same idea as OpenCode's 20k
// minimum), rather than nibbling a little every round.

export interface TrimOptions {
  // The most recent rounds (assistant tool-call message + its results) are
  // never touched — the model is usually still working with them.
  keepRecentRounds: number
  // Payloads at or below this size stay as they are.
  minPayloadChars: number
  // Don't trim at all unless at least this many characters are freed.
  minSavingsChars: number
}

export const DEFAULT_TRIM_OPTIONS: TrimOptions = {
  keepRecentRounds: 4,
  minPayloadChars: 1200,
  minSavingsChars: 24_000,
}

export const TRIM_MARKER = '[vIDE trimmed'

// Tool-call arguments that carry file bodies, by tool name.
const BODY_ARGS: Record<string, string[]> = {
  create_file: ['content'],
  write_file: ['content'],
  edit_file: ['old_string', 'new_string'],
  write_note: ['content'],
  create_script: ['body'],
  update_script: ['body'],
}

function lineCount(text: string): number {
  return text.split('\n').length
}

function resultStub(name: string, args: Record<string, unknown>, content: string): string {
  const where = typeof args.path === 'string' ? ` of ${args.path}` : ''
  const range = typeof args.startLine === 'number' || typeof args.endLine === 'number'
    ? ` (lines ${args.startLine ?? 1}-${args.endLine ?? 'end'})`
    : ''
  return `${TRIM_MARKER} — earlier ${name} result${where}${range}: ${lineCount(content)} lines / ${content.length} chars, ` +
    'removed to save context. Call the tool again if you need it.]'
}

function argStub(value: string): string {
  return `${TRIM_MARKER} — ${lineCount(value)} lines / ${value.length} chars already applied]`
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Returns a trimmed copy, or null when nothing (or too little) is freeable.
export function trimToolPayloads(messages: BridgeMessage[], opts: TrimOptions = DEFAULT_TRIM_OPTIONS): BridgeMessage[] | null {
  // Index of the first message in the protected tail: the Nth-from-last
  // assistant message that made tool calls.
  let protectedFrom = messages.length
  let seen = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].tool_calls?.length) {
      seen++
      protectedFrom = i
      if (seen === opts.keepRecentRounds) break
    }
  }
  if (seen < opts.keepRecentRounds) return null

  const callsById = new Map<string, { name: string; args: Record<string, unknown> }>()
  const next = messages.map((m) => ({ ...m }))
  let saved = 0

  for (let i = 0; i < protectedFrom; i++) {
    const m = next[i]
    if (m.role === 'assistant' && m.tool_calls?.length) {
      m.tool_calls = m.tool_calls.map((tc) => {
        const args = parseArgs(tc.function.arguments)
        callsById.set(tc.id, { name: tc.function.name, args })
        const bodyKeys = BODY_ARGS[tc.function.name] ?? []
        let changed = false
        const trimmedArgs = { ...args }
        for (const key of bodyKeys) {
          const value = args[key]
          if (typeof value !== 'string' || value.length <= opts.minPayloadChars || value.startsWith(TRIM_MARKER)) continue
          const stub = argStub(value)
          saved += value.length - stub.length
          trimmedArgs[key] = stub
          changed = true
        }
        return changed ? { ...tc, function: { ...tc.function, arguments: JSON.stringify(trimmedArgs) } } : tc
      })
    } else if (m.role === 'tool' && m.content && m.content.length > opts.minPayloadChars && !m.content.startsWith(TRIM_MARKER)) {
      const call = callsById.get(m.tool_call_id ?? '') ?? { name: 'tool', args: {} }
      const stub = resultStub(call.name, call.args, m.content)
      saved += m.content.length - stub.length
      m.content = stub
    }
  }

  return saved >= opts.minSavingsChars ? next : null
}
