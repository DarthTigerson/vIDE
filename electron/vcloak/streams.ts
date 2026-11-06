// Stream unmaskers for non-Anthropic providers. Each takes raw server-sent
// event text in chunks and returns text safe to forward, with aliases swapped
// back to real names. Text is held back at path-token boundaries so an alias
// split across two chunks is still restored.
//
// - OpenAI Chat Completions ("data: {json}" chunks, "data: [DONE]")
// - OpenAI Responses API (typed events, used by Codex)
// - Gemini / Code Assist ("data: {json}" chunks, optionally wrapped in {response})

const TOKEN_CHAR = /[A-Za-z0-9_.%/~-]/

export interface StreamUnmasker {
  push(chunk: string): string
  end(): string
}

type Unmask = (s: string) => string

// Holds back the trailing part of a text that may be the start of an alias
class Hold {
  pending = ''

  take(text: string): string {
    this.pending += text
    let cut = this.pending.length
    while (cut > 0 && TOKEN_CHAR.test(this.pending[cut - 1])) cut--
    const ready = this.pending.slice(0, cut)
    this.pending = this.pending.slice(cut)
    return ready
  }

  flush(): string {
    const p = this.pending
    this.pending = ''
    return p
  }
}

// Splits raw SSE text into events (blank-line separated)
class EventSplitter {
  private buf = ''

  push(chunk: string): string[] {
    this.buf += chunk.replace(/\r\n/g, '\n')
    const out: string[] = []
    let idx: number
    while ((idx = this.buf.indexOf('\n\n')) >= 0) {
      out.push(this.buf.slice(0, idx))
      this.buf = this.buf.slice(idx + 2)
    }
    return out
  }

  rest(): string {
    const r = this.buf
    this.buf = ''
    return r
  }
}

interface ParsedEvent {
  event: string | null
  data: unknown
  // Data text that is not JSON (e.g. "[DONE]"), null when JSON
  rawData: string | null
}

function parseEvent(raw: string): ParsedEvent | null {
  const lines = raw.split('\n')
  const eventLine = lines.find((l) => l.startsWith('event:'))
  const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, ''))
  if (dataLines.length === 0) return null
  const text = dataLines.join('\n')
  const event = eventLine ? eventLine.slice(6).trim() : null
  try {
    return { event, data: JSON.parse(text), rawData: null }
  } catch {
    return { event, data: null, rawData: text }
  }
}

function formatEvent(event: string | null, data: unknown): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`
}

// Deep unmask of every string, skipping opaque fields
const OPAQUE_KEYS = new Set(['id', 'item_id', 'call_id', 'encrypted_content', 'signature', 'thoughtSignature', 'thought_signature', 'model', 'object', 'type', 'role', 'status', 'finish_reason', 'finishReason'])

export function unmaskDeep(v: unknown, fn: Unmask): unknown {
  if (typeof v === 'string') return fn(v)
  if (Array.isArray(v)) return v.map((x) => unmaskDeep(x, fn))
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    // Gemini thought parts carry a signature over the text: leave them whole
    if (obj.thought === true) return obj
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(obj)) out[k] = OPAQUE_KEYS.has(k) ? x : unmaskDeep(x, fn)
    return out
  }
  return v
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions

interface ChatChoiceState {
  content: Hold
  reasoning: Hold
  reasoningKey: 'reasoning_content' | 'reasoning' | null
  // tool index -> gathered arguments
  args: Map<number, string>
}

export class OpenAiChatUnmasker implements StreamUnmasker {
  private split = new EventSplitter()
  private choices = new Map<number, ChatChoiceState>()
  private last: Record<string, unknown> | null = null

  constructor(private unmask: Unmask) {}

  push(chunk: string): string {
    return this.split.push(chunk).map((raw) => this.handle(raw)).join('')
  }

  end(): string {
    return this.flushAll() + this.split.rest()
  }

  private state(i: number): ChatChoiceState {
    let s = this.choices.get(i)
    if (!s) {
      s = { content: new Hold(), reasoning: new Hold(), reasoningKey: null, args: new Map() }
      this.choices.set(i, s)
    }
    return s
  }

  private handle(raw: string): string {
    const ev = parseEvent(raw)
    if (!ev) return raw + '\n\n'
    if (ev.rawData !== null) {
      // "[DONE]" (or anything non-JSON): flush first
      return this.flushAll() + raw + '\n\n'
    }
    const data = ev.data as Record<string, unknown>
    const choices = Array.isArray(data?.choices) ? (data.choices as Record<string, unknown>[]) : null
    if (!choices) return formatEvent(ev.event, unmaskDeep(data, this.unmask))
    this.last = data
    const outChoices = choices.map((c) => {
      const i = typeof c.index === 'number' ? c.index : 0
      const s = this.state(i)
      const finishing = Boolean(c.finish_reason)
      const delta = (c.delta as Record<string, unknown> | undefined) ?? (finishing ? {} : undefined)
      if (!delta) return c
      const d: Record<string, unknown> = { ...delta }
      if (typeof d.content === 'string' || (finishing && s.content.pending)) {
        const ready = s.content.take(typeof d.content === 'string' ? d.content : '') + (finishing ? s.content.flush() : '')
        if (typeof d.content === 'string' || ready) d.content = this.unmask(ready)
      }
      for (const key of ['reasoning_content', 'reasoning'] as const) {
        if (typeof d[key] === 'string') s.reasoningKey = key
        if (typeof d[key] === 'string' || (finishing && s.reasoningKey === key && s.reasoning.pending)) {
          const ready = s.reasoning.take(typeof d[key] === 'string' ? (d[key] as string) : '') + (finishing ? s.reasoning.flush() : '')
          if (typeof d[key] === 'string' || ready) d[key] = this.unmask(ready)
        }
      }
      if (Array.isArray(d.tool_calls)) {
        d.tool_calls = (d.tool_calls as Record<string, unknown>[]).map((tc) => {
          const ti = typeof tc.index === 'number' ? tc.index : 0
          const fn = tc.function as Record<string, unknown> | undefined
          if (!fn || typeof fn.arguments !== 'string') return tc
          s.args.set(ti, (s.args.get(ti) ?? '') + fn.arguments)
          return { ...tc, function: { ...fn, arguments: '' } }
        })
      }
      // Gathered tool arguments are released with the chunk that finishes the choice
      if (finishing && s.args.size > 0) {
        const released = [...s.args].map(([index, args]) => ({ index, function: { arguments: unmaskArgs(args, this.unmask) } }))
        s.args.clear()
        d.tool_calls = [...(Array.isArray(d.tool_calls) ? (d.tool_calls as Record<string, unknown>[]) : []), ...released]
      }
      return { ...c, delta: d }
    })
    return formatEvent(ev.event, { ...data, choices: outChoices })
  }

  private flushChoice(i: number): string {
    const s = this.choices.get(i)
    if (!s) return ''
    const delta: Record<string, unknown> = {}
    const content = s.content.flush()
    if (content) delta.content = this.unmask(content)
    const reasoning = s.reasoning.flush()
    if (reasoning && s.reasoningKey) delta[s.reasoningKey] = this.unmask(reasoning)
    if (s.args.size > 0) {
      delta.tool_calls = [...s.args].map(([index, args]) => ({ index, function: { arguments: unmaskArgs(args, this.unmask) } }))
      s.args.clear()
    }
    if (Object.keys(delta).length === 0) return ''
    const base = this.last ?? {}
    return formatEvent(null, { ...base, choices: [{ index: i, delta, finish_reason: null }] })
  }

  private flushAll(): string {
    let out = ''
    for (const i of this.choices.keys()) out += this.flushChoice(i)
    return out
  }
}

function unmaskArgs(args: string, fn: Unmask): string {
  try {
    return JSON.stringify(unmaskDeep(JSON.parse(args), fn))
  } catch {
    return fn(args)
  }
}

// ---------------------------------------------------------------------------
// OpenAI Responses API (Codex)

export class ResponsesUnmasker implements StreamUnmasker {
  private split = new EventSplitter()
  private holds = new Map<string, { hold: Hold; event: string | null; data: Record<string, unknown> }>()

  constructor(private unmask: Unmask) {}

  push(chunk: string): string {
    return this.split.push(chunk).map((raw) => this.handle(raw)).join('')
  }

  end(): string {
    let out = ''
    for (const key of [...this.holds.keys()]) out += this.flushKey(key)
    return out + this.split.rest()
  }

  private keyOf(d: Record<string, unknown>, type: string): string {
    const base = type.replace(/\.(delta|done)$/, '')
    return [base, d.item_id ?? '', d.output_index ?? '', d.content_index ?? '', d.summary_index ?? ''].join('|')
  }

  private handle(raw: string): string {
    const ev = parseEvent(raw)
    if (!ev || ev.rawData !== null) return raw + '\n\n'
    const data = ev.data as Record<string, unknown>
    const type = typeof data?.type === 'string' ? data.type : ev.event ?? ''
    if (type.endsWith('.delta') && typeof data.delta === 'string') {
      const key = this.keyOf(data, type)
      let h = this.holds.get(key)
      if (!h) {
        h = { hold: new Hold(), event: ev.event, data }
        this.holds.set(key, h)
      }
      h.data = data
      if (type.includes('arguments')) {
        // Tool arguments: gathered whole and released at .done
        h.hold.pending += data.delta
        return ''
      }
      const ready = h.hold.take(data.delta)
      if (!ready) return ''
      return formatEvent(ev.event, { ...data, delta: this.unmask(ready) })
    }
    const key = type.endsWith('.done') ? this.keyOf(data, type) : null
    const flushed = key && this.holds.has(key) ? this.flushKey(key) : ''
    return flushed + formatEvent(ev.event, unmaskDeep(data, this.unmask))
  }

  private flushKey(key: string): string {
    const h = this.holds.get(key)
    this.holds.delete(key)
    if (!h) return ''
    const pending = h.hold.flush()
    if (!pending) return ''
    const isArgs = String(h.data.type ?? h.event ?? '').includes('arguments')
    const delta = isArgs ? unmaskArgs(pending, this.unmask) : this.unmask(pending)
    return formatEvent(h.event, { ...h.data, delta })
  }
}

// ---------------------------------------------------------------------------
// Gemini API and Code Assist (Gemini CLI with Google login)

export class GeminiUnmasker implements StreamUnmasker {
  private split = new EventSplitter()
  private holds = new Map<number, Hold>()
  private wrapped = false

  constructor(private unmask: Unmask) {}

  push(chunk: string): string {
    return this.split.push(chunk).map((raw) => this.handle(raw)).join('')
  }

  end(): string {
    let out = ''
    for (const [i, h] of this.holds) {
      const text = h.flush()
      if (!text) continue
      const inner = { candidates: [{ index: i, content: { role: 'model', parts: [{ text: this.unmask(text) }] } }] }
      out += formatEvent(null, this.wrapped ? { response: inner } : inner)
    }
    this.holds.clear()
    return out + this.split.rest()
  }

  private handle(raw: string): string {
    const ev = parseEvent(raw)
    if (!ev || ev.rawData !== null) return raw + '\n\n'
    const data = ev.data as Record<string, unknown>
    if (data && typeof data === 'object' && data.response && typeof data.response === 'object') {
      this.wrapped = true
      return formatEvent(ev.event, { ...unmaskDeep({ ...data, response: undefined }, this.unmask) as object, response: this.handleInner(data.response as Record<string, unknown>) })
    }
    return formatEvent(ev.event, this.handleInner(data))
  }

  private handleInner(inner: Record<string, unknown>): Record<string, unknown> {
    const candidates = Array.isArray(inner?.candidates) ? (inner.candidates as Record<string, unknown>[]) : null
    if (!candidates) return unmaskDeep(inner, this.unmask) as Record<string, unknown>
    const out = candidates.map((c, pos) => {
      const i = typeof c.index === 'number' ? c.index : pos
      let h = this.holds.get(i)
      if (!h) {
        h = new Hold()
        this.holds.set(i, h)
      }
      const content = c.content as Record<string, unknown> | undefined
      const parts = Array.isArray(content?.parts) ? (content!.parts as Record<string, unknown>[]) : null
      if (!parts) return unmaskDeep(c, this.unmask)
      const finishing = Boolean(c.finishReason)
      let lastText = -1
      const newParts = parts.map((p, k) => {
        if (p.thought === true || typeof p.text !== 'string') return unmaskDeep(p, this.unmask)
        lastText = k
        return { ...p, text: this.unmask(h!.take(p.text)) }
      })
      if (finishing) {
        const rest = h.flush()
        if (rest) {
          if (lastText >= 0) newParts[lastText] = { ...(newParts[lastText] as object), text: (newParts[lastText] as { text: string }).text + this.unmask(rest) }
          else newParts.push({ text: this.unmask(rest) })
        }
      }
      return { ...(unmaskDeep({ ...c, content: undefined }, this.unmask) as object), content: { ...content, parts: newParts } }
    })
    return { ...(unmaskDeep({ ...inner, candidates: undefined }, this.unmask) as object), candidates: out }
  }
}
