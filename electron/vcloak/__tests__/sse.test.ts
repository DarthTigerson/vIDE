import { describe, it, expect } from 'vitest'
import { SseUnmasker } from '../sse'

const unmask = (s: string) => s.replaceAll('acme-corp/pabcdef', 'acme-corp/platform')

function ev(data: object): string {
  return `event: ${(data as { type: string }).type}\ndata: ${JSON.stringify(data)}\n\n`
}

function collectText(out: string): string {
  return out
    .split('\n\n')
    .filter(Boolean)
    .map((e) => JSON.parse(e.split('\n').find((l) => l.startsWith('data:'))!.slice(5)))
    .filter((d) => d.type === 'content_block_delta' && d.delta.type === 'text_delta')
    .map((d) => d.delta.text)
    .join('')
}

describe('SseUnmasker', () => {
  it('restores an alias split across chunks and events', () => {
    const u = new SseUnmasker(unmask)
    let out = ''
    out += u.push(ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }))
    const d1 = ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'repo acme-co' } })
    const d2 = ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'rp/pabcdef ok' } })
    const all = d1 + d2
    out += u.push(all.slice(0, 30))
    out += u.push(all.slice(30))
    out += u.push(ev({ type: 'content_block_stop', index: 0 }))
    out += u.end()
    expect(collectText(out)).toBe('repo acme-corp/platform ok')
    expect(out).not.toContain('pabcdef')
  })

  it('restores tool input JSON at block stop', () => {
    const u = new SseUnmasker(unmask)
    let out = u.push(ev({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't', name: 'Bash', input: {} } }))
    out += u.push(ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"command": "cd acme-co' } }))
    out += u.push(ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'rp/pabcdef"}' } }))
    out += u.push(ev({ type: 'content_block_stop', index: 1 }))
    const stopAt = out.indexOf('content_block_stop')
    const deltaAt = out.indexOf('input_json_delta')
    expect(deltaAt).toBeGreaterThan(-1)
    expect(deltaAt).toBeLessThan(stopAt)
    expect(out).toContain(JSON.stringify(JSON.stringify({ command: 'cd acme-corp/platform' })).slice(1, -1))
  })

  it('passes thinking deltas through untouched', () => {
    const u = new SseUnmasker(unmask)
    const start = ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } })
    const delta = ev({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'acme-corp/pabcdef' } })
    expect(u.push(start + delta)).toBe(start + delta)
  })

  it('forwards other events as is', () => {
    const u = new SseUnmasker(unmask)
    const ping = 'event: ping\ndata: {"type": "ping"}\n\n'
    expect(u.push(ping)).toBe(ping)
  })
})
