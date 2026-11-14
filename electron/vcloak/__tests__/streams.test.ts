import { describe, it, expect } from 'vitest'
import { GeminiUnmasker, OpenAiChatUnmasker, ResponsesUnmasker, type StreamUnmasker } from '../streams'

const unmask = (s: string) => s.replaceAll('acme-corp/harbor', 'acme-corp/platform')

const data = (d: unknown, event?: string) => `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(d)}\n\n`

function events(out: string): { event: string | null; data: any }[] {
  return out
    .split('\n\n')
    .filter(Boolean)
    .map((raw) => {
      const lines = raw.split('\n')
      const e = lines.find((l) => l.startsWith('event:'))
      const d = lines.find((l) => l.startsWith('data:'))!.slice(5).trim()
      return { event: e ? e.slice(6).trim() : null, data: d === '[DONE]' ? d : JSON.parse(d) }
    })
}

// Feeds the stream in awkward slices to test chunk boundaries
function run(u: StreamUnmasker, stream: string, size = 7): string {
  let out = ''
  for (let i = 0; i < stream.length; i += size) out += u.push(stream.slice(i, i + size))
  return out + u.end()
}

describe('OpenAiChatUnmasker', () => {
  const chunk = (delta: object, finish: string | null = null) => data({ id: 'c1', object: 'chat.completion.chunk', model: 'm', choices: [{ index: 0, delta, finish_reason: finish }] })

  it('restores an alias split across deltas, in order', () => {
    const stream = chunk({ role: 'assistant', content: 'see acme-co' }) + chunk({ content: 'rp/harbor now' }) + chunk({}, 'stop') + 'data: [DONE]\n\n'
    const out = run(new OpenAiChatUnmasker(unmask), stream)
    const evs = events(out)
    const text = evs.filter((e) => e.data !== '[DONE]').map((e) => e.data.choices[0].delta.content ?? '').join('')
    expect(text).toBe('see acme-corp/platform now')
    expect(out).not.toContain('harbor')
    expect(evs[evs.length - 1].data).toBe('[DONE]')
  })

  it('releases trailing held text with the finishing chunk', () => {
    const stream = chunk({ content: 'path acme-corp/harbor' }) + chunk({}, 'stop')
    const evs = events(run(new OpenAiChatUnmasker(unmask), stream, 1000))
    expect(evs.map((e) => e.data.choices[0].delta.content ?? '').join('')).toBe('path acme-corp/platform')
    expect(evs[evs.length - 1].data.choices[0].finish_reason).toBe('stop')
  })

  it('gathers tool call arguments and restores them whole', () => {
    const stream =
      chunk({ tool_calls: [{ index: 0, id: 't1', type: 'function', function: { name: 'read', arguments: '{"path":"acme-co' } }] }) +
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'rp/harbor/x.md"}' } }] }) +
      chunk({}, 'tool_calls')
    const evs = events(run(new OpenAiChatUnmasker(unmask), stream))
    const args = evs.flatMap((e) => e.data.choices[0].delta.tool_calls ?? []).map((t: any) => t.function?.arguments ?? '').join('')
    expect(JSON.parse(args)).toEqual({ path: 'acme-corp/platform/x.md' })
    expect(evs[0].data.choices[0].delta.tool_calls[0].function.name).toBe('read')
  })

  it('flushes on [DONE] when no finish_reason came', () => {
    const stream = chunk({ content: 'acme-corp/harbor' }) + 'data: [DONE]\n\n'
    const out = run(new OpenAiChatUnmasker(unmask), stream)
    expect(out).toContain('acme-corp/platform')
    expect(out.trim().endsWith('data: [DONE]')).toBe(true)
  })
})

describe('ResponsesUnmasker', () => {
  it('restores output text deltas split across events', () => {
    const stream =
      data({ type: 'response.output_text.delta', item_id: 'i1', output_index: 0, content_index: 0, delta: 'in acme-c' }, 'response.output_text.delta') +
      data({ type: 'response.output_text.delta', item_id: 'i1', output_index: 0, content_index: 0, delta: 'orp/harbor ok' }, 'response.output_text.delta') +
      data({ type: 'response.output_text.done', item_id: 'i1', output_index: 0, content_index: 0, text: 'in acme-corp/harbor ok' }, 'response.output_text.done')
    const evs = events(run(new ResponsesUnmasker(unmask), stream))
    const deltas = evs.filter((e) => e.data.type === 'response.output_text.delta').map((e) => e.data.delta).join('')
    expect(deltas).toBe('in acme-corp/platform ok')
    expect(evs.find((e) => e.data.type === 'response.output_text.done')!.data.text).toBe('in acme-corp/platform ok')
    expect(evs.every((e) => e.event === e.data.type)).toBe(true)
  })

  it('releases function call arguments whole before the done event', () => {
    const stream =
      data({ type: 'response.function_call_arguments.delta', item_id: 'f1', output_index: 1, delta: '{"cmd":"cd acme-' }) +
      data({ type: 'response.function_call_arguments.delta', item_id: 'f1', output_index: 1, delta: 'corp/harbor"}' }) +
      data({ type: 'response.function_call_arguments.done', item_id: 'f1', output_index: 1, arguments: '{"cmd":"cd acme-corp/harbor"}' })
    const evs = events(run(new ResponsesUnmasker(unmask), stream))
    expect(evs.map((e) => e.data.type)).toEqual(['response.function_call_arguments.delta', 'response.function_call_arguments.done'])
    expect(JSON.parse(evs[0].data.delta)).toEqual({ cmd: 'cd acme-corp/platform' })
    expect(JSON.parse(evs[1].data.arguments)).toEqual({ cmd: 'cd acme-corp/platform' })
  })

  it('unmasks completed items but keeps encrypted reasoning and ids as is', () => {
    const item = { type: 'response.output_item.done', item: { id: 'acme-corp/harbor', type: 'reasoning', encrypted_content: 'acme-corp/harbor', summary: [{ type: 'summary_text', text: 'acme-corp/harbor' }] } }
    const evs = events(run(new ResponsesUnmasker(unmask), data(item)))
    expect(evs[0].data.item.encrypted_content).toBe('acme-corp/harbor')
    expect(evs[0].data.item.id).toBe('acme-corp/harbor')
    expect(evs[0].data.item.summary[0].text).toBe('acme-corp/platform')
  })
})

describe('GeminiUnmasker', () => {
  const part = (text: string, finish?: string) => ({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text }] }, ...(finish ? { finishReason: finish } : {}) }] })

  it('restores text split across chunks (API key form)', () => {
    const stream = data(part('see acme-co')) + data(part('rp/harbor')) + data(part(' done', 'STOP'))
    const evs = events(run(new GeminiUnmasker(unmask), stream))
    expect(evs.map((e) => e.data.candidates[0].content.parts.map((p: any) => p.text).join('')).join('')).toBe('see acme-corp/platform done')
  })

  it('handles the Code Assist {response} wrapper and flushes at the end', () => {
    const stream = data({ traceId: 't', response: part('at acme-corp/harbor') })
    const evs = events(run(new GeminiUnmasker(unmask), stream))
    const text = evs.map((e) => e.data.response.candidates[0].content.parts.map((p: any) => p.text).join('')).join('')
    expect(text).toBe('at acme-corp/platform')
    expect(evs[0].data.traceId).toBe('t')
  })

  it('restores function call arguments and leaves thought parts alone', () => {
    const chunk = { candidates: [{ index: 0, content: { role: 'model', parts: [{ thought: true, text: 'acme-corp/harbor' }, { functionCall: { name: 'read_file', args: { path: 'acme-corp/harbor/a.md' } } }] }, finishReason: 'STOP' }] }
    const evs = events(run(new GeminiUnmasker(unmask), data(chunk)))
    const parts = evs[0].data.candidates[0].content.parts
    expect(parts[0].text).toBe('acme-corp/harbor')
    expect(parts[1].functionCall.args.path).toBe('acme-corp/platform/a.md')
  })
})
