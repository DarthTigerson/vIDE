import { describe, it, expect } from 'vitest'
import { ThinkTagSplitter } from '../bridgeReasoning'

function run(chunks: string[]) {
  const s = new ThinkTagSplitter()
  let text = ''
  let reasoning = ''
  for (const c of [...chunks.map((c) => s.push(c)), s.flush()]) {
    text += c.text
    reasoning += c.reasoning
  }
  return { text, reasoning }
}

describe('ThinkTagSplitter', () => {
  it('passes plain content through as text', () => {
    expect(run(['hello ', 'world'])).toEqual({ text: 'hello world', reasoning: '' })
  })

  it('moves a <think> block into reasoning', () => {
    expect(run(['<think>plan it</think>Answer'])).toEqual({ text: 'Answer', reasoning: 'plan it' })
  })

  it('handles tags split across chunks', () => {
    expect(run(['<thi', 'nk>a', 'b</th', 'ink>c'])).toEqual({ text: 'c', reasoning: 'ab' })
  })

  it('keeps a lone "<" that never becomes a tag as text', () => {
    expect(run(['a <', 'b'])).toEqual({ text: 'a <b', reasoning: '' })
    expect(run(['a <'])).toEqual({ text: 'a <', reasoning: '' })
  })

  it('treats an unclosed think block at end of stream as reasoning', () => {
    expect(run(['<think>still going</th'])).toEqual({ text: '', reasoning: 'still going</th' })
  })

  it('emits reasoning as it streams, before the block closes', () => {
    const s = new ThinkTagSplitter()
    expect(s.push('<think>one ')).toEqual({ text: '', reasoning: 'one ' })
    expect(s.push('two')).toEqual({ text: '', reasoning: 'two' })
  })
})
