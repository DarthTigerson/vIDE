// One completion request to a fill-in-the-middle server: llama.cpp's own
// /infill (vIDE's managed server, and most custom ones) or an
// OpenAI-compatible /v1/completions that accepts a `suffix`. Every failure —
// HTTP error, unreachable server, abort, unexpected JSON — resolves null, so
// a hiccup just means no ghost text for that keystroke.

export type CompletionEndpoint = { kind: 'infill' | 'openai'; baseUrl: string; apiKey?: string }

export interface ExtraChunk { filename: string; text: string }

export interface CompletionRequest {
  prefix: string
  suffix: string
  // Snippets from other files (open tabs, definitions of what's used near the
  // cursor), sent as llama.cpp's input_extra: the repo-level context Qwen2.5
  // Coder was trained to read. Ignored by OpenAI-compatible servers.
  extra?: ExtraChunk[]
}

// A well-behaved single completion should never be this long; treat an
// over-long response as a failed completion rather than truncate mid-token.
const MAX_COMPLETION_LENGTH = 2000

const lastLine = (text: string) => text.slice(text.lastIndexOf('\n') + 1)

// Mid-statement, ghost text finishes the line and nothing more: a small model
// that carries on past it mostly invents code. On a fresh line it may write a
// block, ended by llama.cpp once the indentation drops below the cursor's
// (n_indent), or at a blank line.
function shape(req: CompletionRequest): { stop: string[]; maxTokens: number; nIndent?: number } {
  const current = lastLine(req.prefix)
  if (current.trim()) return { stop: ['\n'], maxTokens: 48 }
  return { stop: ['\n\n'], maxTokens: 128, nIndent: current.length }
}

// Unlike a chat model's reply, a FIM answer's leading whitespace is part of
// the code (the space after `return`, the newline and indent of the next
// line), so only the trailing end is trimmed. What already follows the cursor
// is cut off the end (Monaco's auto-closed brackets, the block's closing
// brace), and a suggestion with nothing new left, or one that only repeats
// the line above, shows nothing.
export function postProcessCompletion(raw: string, at: { prefix: string; suffix: string }): string | null {
  let text = raw.replace(/\s+$/, '')

  const restOfLine = at.suffix.slice(0, at.suffix.indexOf('\n') === -1 ? undefined : at.suffix.indexOf('\n')).trim()
  if (restOfLine && text.endsWith(restOfLine)) text = text.slice(0, -restOfLine.length).replace(/\s+$/, '')

  const nextLines = at.suffix.split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  const lines = text.split('\n')
  while (lines.length > 1 && nextLines[0] && lines[lines.length - 1].trim() === nextLines[0]) lines.pop()
  text = lines.join('\n').replace(/\s+$/, '')

  if (!text.trim()) return null
  if (text.length > MAX_COMPLETION_LENGTH) return null
  const previous = at.prefix.split('\n').slice(0, -1).reverse().find((l) => l.trim())
  if (previous && !lastLine(at.prefix).trim() && text.trim() === previous.trim()) return null
  return text
}

export async function requestCompletion(
  ep: CompletionEndpoint,
  req: CompletionRequest,
  signal?: AbortSignal
): Promise<string | null> {
  const base = ep.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ep.apiKey) headers.Authorization = `Bearer ${ep.apiKey}`
  const { stop, maxTokens, nIndent } = shape(req)

  const [path, body] = ep.kind === 'infill'
    ? ['/infill', {
      input_prefix: req.prefix,
      input_suffix: req.suffix,
      ...(req.extra?.length ? { input_extra: req.extra } : {}),
      ...(nIndent !== undefined ? { n_indent: nIndent } : {}),
      n_predict: maxTokens,
      // Generation time cap, counted once a newline has been produced.
      t_max_predict_ms: 300,
      cache_prompt: true,
      // Greedy: measured on vIDE's own code, the default sampling (0.8)
      // got 56% of mid-line completions exactly right, greedy 64%.
      temperature: 0,
      stop,
    }]
    : ['/v1/completions', { prompt: req.prefix, suffix: req.suffix, max_tokens: maxTokens, temperature: 0, stop }]

  try {
    const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!response.ok) return null
    const json = await response.json() as { content?: unknown; choices?: { text?: unknown }[] }
    const text = ep.kind === 'infill' ? json.content : json.choices?.[0]?.text
    return typeof text === 'string' ? postProcessCompletion(text, req) : null
  } catch {
    return null
  }
}

// Start-up readiness: the server answers a completion request at all. Judged
// by HTTP status, not by text, since a working FIM model can legitimately
// return nothing for the probe; a failing server's own explanation (llama.cpp
// sends a 501 "Infill is not supported by this model" for a non-FIM GGUF)
// comes back as the message.
export async function probeCompletion(
  ep: CompletionEndpoint,
  timeoutMs = 30000
): Promise<{ ok: true } | { ok: false; message?: string }> {
  const base = ep.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ep.apiKey) headers.Authorization = `Bearer ${ep.apiKey}`
  const [path, body] = ep.kind === 'infill'
    ? ['/infill', { input_prefix: 'const x = ', input_suffix: '', n_predict: 4 }]
    : ['/v1/completions', { prompt: 'const x = ', max_tokens: 4 }]
  try {
    const response = await fetch(base + path, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.ok) return { ok: true }
    const json = await response.json().catch(() => null) as { error?: { message?: unknown } | string } | null
    const message = typeof json?.error === 'string' ? json.error : json?.error?.message
    return typeof message === 'string' && message ? { ok: false, message } : { ok: false }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { ok: false, message: 'The model took too long to answer' }
    return { ok: false }
  }
}
