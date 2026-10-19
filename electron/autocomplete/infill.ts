// One completion request to a fill-in-the-middle server: llama.cpp's own
// /infill (vIDE's managed server, and most custom ones) or an
// OpenAI-compatible /v1/completions that accepts a `suffix`. Every failure —
// HTTP error, unreachable server, abort, unexpected JSON — resolves null, so
// a hiccup just means no ghost text for that keystroke.

export type CompletionEndpoint = { kind: 'infill' | 'openai'; baseUrl: string; apiKey?: string }

// Short, and stopped at the first blank line: ghost text is meant to finish
// the current statement or block, and every extra token is latency.
const MAX_TOKENS = 64
const STOP = ['\n\n']

// A well-behaved single completion should never be this long; treat an
// over-long response as a failed completion rather than truncate mid-token.
const MAX_COMPLETION_LENGTH = 2000

// Unlike a chat model's reply, a FIM answer's leading whitespace is part of
// the code (the space after `return`, the newline and indent of the next
// line), so only the trailing end is trimmed.
export function postProcessCompletion(raw: string): string | null {
  const text = raw.replace(/\s+$/, '')
  if (!text.trim()) return null
  if (text.length > MAX_COMPLETION_LENGTH) return null
  return text
}

export async function requestCompletion(
  ep: CompletionEndpoint,
  prefix: string,
  suffix: string,
  signal?: AbortSignal
): Promise<string | null> {
  const base = ep.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ep.apiKey) headers.Authorization = `Bearer ${ep.apiKey}`

  const [path, body] = ep.kind === 'infill'
    ? ['/infill', {
      input_prefix: prefix,
      input_suffix: suffix,
      n_predict: MAX_TOKENS,
      // Generation time cap, counted once a newline has been produced.
      t_max_predict_ms: 300,
      cache_prompt: true,
      stop: STOP,
    }]
    : ['/v1/completions', { prompt: prefix, suffix, max_tokens: MAX_TOKENS, stop: STOP }]

  try {
    const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!response.ok) return null
    const json = await response.json() as { content?: unknown; choices?: { text?: unknown }[] }
    const text = ep.kind === 'infill' ? json.content : json.choices?.[0]?.text
    return typeof text === 'string' ? postProcessCompletion(text) : null
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
