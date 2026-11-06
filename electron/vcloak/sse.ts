// Unmasks a streamed Anthropic Messages reply (server-sent events).
// - text deltas: held back at path-token boundaries so an alias split across
//   two chunks is still restored
// - tool_use input: partial JSON gathered and restored as a whole at block stop
// - thinking / signature deltas: passed through untouched (signed content)

const TOKEN_CHAR = /[A-Za-z0-9_.%/-]/

interface BlockState {
  kind: 'text' | 'tool' | 'raw'
  pending: string
}

export class SseUnmasker {
  private buf = ''
  private blocks = new Map<number, BlockState>()

  constructor(private unmask: (s: string) => string) {}

  // Feed raw bytes as text; returns SSE text safe to forward now
  push(chunk: string): string {
    this.buf += chunk.replace(/\r\n/g, '\n')
    let out = ''
    let idx: number
    while ((idx = this.buf.indexOf('\n\n')) >= 0) {
      const raw = this.buf.slice(0, idx)
      this.buf = this.buf.slice(idx + 2)
      out += this.handleEvent(raw)
    }
    return out
  }

  // End of stream: flush whatever is left
  end(): string {
    let out = ''
    for (const [index, b] of this.blocks) {
      if (b.pending) out += this.emitDelta(index, b)
    }
    this.blocks.clear()
    if (this.buf) out += this.buf
    this.buf = ''
    return out
  }

  private handleEvent(raw: string): string {
    const lines = raw.split('\n')
    const eventLine = lines.find((l) => l.startsWith('event:'))
    const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, ''))
    if (dataLines.length === 0) return raw + '\n\n'
    let data: Record<string, unknown>
    try {
      data = JSON.parse(dataLines.join('\n'))
    } catch {
      return raw + '\n\n'
    }
    const type = data.type
    const index = typeof data.index === 'number' ? data.index : -1

    if (type === 'content_block_start') {
      const block = data.content_block as Record<string, unknown> | undefined
      const kind = block?.type === 'text' ? 'text' : block?.type === 'tool_use' || block?.type === 'server_tool_use' ? 'tool' : 'raw'
      this.blocks.set(index, { kind, pending: '' })
      return raw + '\n\n'
    }

    if (type === 'content_block_delta') {
      const b = this.blocks.get(index)
      const delta = data.delta as Record<string, unknown> | undefined
      if (!b || !delta) return raw + '\n\n'
      if (b.kind === 'text' && delta.type === 'text_delta' && typeof delta.text === 'string') {
        b.pending += delta.text
        let cut = b.pending.length
        while (cut > 0 && TOKEN_CHAR.test(b.pending[cut - 1])) cut--
        if (cut === 0) return ''
        const ready = b.pending.slice(0, cut)
        b.pending = b.pending.slice(cut)
        return this.event('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: this.unmask(ready) } })
      }
      if (b.kind === 'tool' && delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        b.pending += delta.partial_json
        return ''
      }
      return raw + '\n\n'
    }

    if (type === 'content_block_stop') {
      const b = this.blocks.get(index)
      this.blocks.delete(index)
      const flushed = b && b.pending ? this.emitDelta(index, b) : ''
      return flushed + raw + '\n\n'
    }

    return raw + '\n\n'
  }

  private emitDelta(index: number, b: BlockState): string {
    const pending = b.pending
    b.pending = ''
    if (b.kind === 'text') {
      return this.event('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: this.unmask(pending) } })
    }
    let json = pending
    try {
      json = JSON.stringify(unmaskJson(JSON.parse(pending), this.unmask))
    } catch {
      // not complete JSON: forward as received (aliases stay, nothing leaks)
    }
    return this.event('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json } })
  }

  private event(name: string, data: unknown): string {
    return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
  }
}

function unmaskJson(v: unknown, fn: (s: string) => string): unknown {
  if (typeof v === 'string') return fn(v)
  if (Array.isArray(v)) return v.map((x) => unmaskJson(x, fn))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = unmaskJson(x, fn)
    return out
  }
  return v
}
