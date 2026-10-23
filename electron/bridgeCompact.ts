import type { BridgeMessage, BridgeSettings } from './bridge'
import { requestDispatcher } from './bridgeHttp'

// vIDE Compacting for Bridge/llama sessions: when the transcript nears the
// model's context window, the same model writes a handoff summary of
// everything so far and the transcript restarts from that summary plus the
// most recent rounds. Same shape as Claude Code's /compact and Codex's
// local compaction (summarise, then rebuild history from initial context +
// summary + recent work).

// Auto-compact once a request has used this share of the context window.
export const AUTO_COMPACT_RATIO = 0.8

// Rounds (assistant tool-call message + its results) kept verbatim after an
// in-turn compaction, so the model doesn't lose the step it is in the middle of.
export const COMPACT_KEEP_ROUNDS = 2

// Prefix of the user message that carries a summary. The renderer's marker
// message uses the same text, so both sides recognise a compacted transcript.
export const SUMMARY_PREFIX = '[Summary of the earlier conversation, written by vIDE compaction. Continue the work from here.]'

export const COMPACT_PROMPT = `You are writing a handoff note for an AI coding agent that will continue this work with no other memory of it. The conversation transcript follows. Write a summary another agent can act on immediately.

Use exactly these sections:
## User requests
Every instruction and requirement from the user, the latest request quoted verbatim. Include constraints and preferences they stated.
## Progress
What has been done: files created, changed or deleted (full paths), commands run and their outcome, tests and their status.
## Decisions
Choices made and why, approaches that were tried and failed (so they are not retried).
## Current state
What was being worked on at the end of the transcript, including any error being debugged and its exact message.
## Next steps
The remaining work, in order. Include todo ticket ids and board keys if the todo board is in use.
## Key references
Absolute file paths, section names of specs or documents, URLs, identifiers that will be needed again.

Be specific and complete; prefer exact paths, names and numbers over descriptions. Do not invent anything that is not in the transcript. Output only the summary.`

// Transcript cap for the summarisation request, so the summary call itself
// can't overflow the window it is trying to relieve. ~3 chars per token,
// using at most 60% of the window (the rest is the prompt and the summary).
function transcriptCharBudget(contextWindow: number | null): number {
  return contextWindow ? Math.floor(contextWindow * 3 * 0.6) : 60_000
}

const TOOL_ARG_CHARS = 300
const TOOL_RESULT_CHARS = 600

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} more chars]`
}

export function renderTranscript(messages: BridgeMessage[], contextWindow: number | null): string {
  const names = new Map<string, string>()
  const parts: string[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'user') parts.push(`USER:\n${m.content ?? ''}`)
    else if (m.role === 'assistant') {
      if (m.content) parts.push(`ASSISTANT:\n${m.content}`)
      for (const tc of m.tool_calls ?? []) {
        names.set(tc.id, tc.function.name)
        parts.push(`TOOL CALL ${tc.function.name}(${clip(tc.function.arguments, TOOL_ARG_CHARS)})`)
      }
    } else if (m.role === 'tool') {
      const name = names.get(m.tool_call_id ?? '') ?? 'tool'
      parts.push(`TOOL RESULT ${name}:\n${clip(m.content ?? '', TOOL_RESULT_CHARS)}`)
    }
  }
  const full = parts.join('\n\n')
  const budget = transcriptCharBudget(contextWindow)
  if (full.length <= budget) return full
  // Keep the opening (the original request) and the most recent work; the
  // middle is what's least needed for "where are we now".
  const head = Math.floor(budget * 0.2)
  const tail = budget - head
  return `${full.slice(0, head)}\n\n[… ${full.length - budget} chars of the middle of the transcript omitted …]\n\n${full.slice(-tail)}`
}

// Index of the first message of the last `rounds` tool-call rounds, or
// messages.length when there are none to keep.
function recentRoundsStart(messages: BridgeMessage[], rounds: number): number {
  let start = messages.length
  let seen = 0
  for (let i = messages.length - 1; i >= 0 && seen < rounds; i--) {
    if (messages[i].role === 'assistant' && messages[i].tool_calls?.length) {
      seen++
      start = i
    }
  }
  return start
}

export function wrapSummary(summary: string): string {
  return `${SUMMARY_PREFIX}\n\n${summary.trim()}`
}

// The rebuilt transcript: the original system prompt, the summary as a user
// message, then the recent rounds verbatim.
export function compactMessages(messages: BridgeMessage[], summary: string, keepRounds = COMPACT_KEEP_ROUNDS): BridgeMessage[] {
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  const tail = messages.slice(recentRoundsStart(messages, keepRounds))
  return [...system, { role: 'user', content: wrapSummary(summary) }, ...tail]
}

export async function summarize(
  settings: BridgeSettings,
  messages: BridgeMessage[],
  contextWindow: number | null,
  signal?: AbortSignal,
  focus?: string,
): Promise<string> {
  const transcript = renderTranscript(messages, contextWindow)
  const focusNote = focus?.trim() ? `\n\nThe user asked the summary to focus on: ${focus.trim()}` : ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }
  if (settings.sessionId) headers['X-Bridge-Session-ID'] = settings.sessionId
  const response = await fetch(`${settings.endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.modelId,
      messages: [
        { role: 'system', content: COMPACT_PROMPT },
        { role: 'user', content: `<transcript>\n${transcript}\n</transcript>${focusNote}` },
      ],
      stream: false,
    }),
    signal,
    dispatcher: requestDispatcher(settings.requestTimeoutMs),
  } as RequestInit)
  if (!response.ok) throw new Error(`summary request failed: ${response.status} ${(await response.text()).slice(0, 200)}`)
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> }
  const summary = data.choices?.[0]?.message?.content?.trim()
  if (!summary) throw new Error('the model returned an empty summary')
  return summary
}

// llama.cpp's /props reports the context size it actually allocated (which
// Auto-optimize lets it choose). Other OpenAI-compatible servers usually
// don't have it, and then only the overflow fallback applies.
export async function fetchContextWindow(endpoint: string, apiKey: string): Promise<number | null> {
  const base = endpoint.replace(/\/v1\/?$/, '')
  try {
    const response = await fetch(`${base}/props`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return null
    const props = (await response.json()) as { default_generation_settings?: { n_ctx?: number } }
    const nCtx = props.default_generation_settings?.n_ctx
    return typeof nCtx === 'number' && nCtx > 0 ? nCtx : null
  } catch {
    return null
  }
}

// Error bodies servers send when the prompt is longer than the context
// (llama.cpp: "the request exceeds the available context size"; OpenAI-style:
// "maximum context length"; others: "context window", "too many tokens").
const OVERFLOW_RE = /exceed[s]? the available context|context (?:size|length|window)|maximum context|too many tokens|prompt is too long/i

export function isContextOverflow(status: number, body: string): boolean {
  return (status === 400 || status === 413 || status === 500) && OVERFLOW_RE.test(body)
}
