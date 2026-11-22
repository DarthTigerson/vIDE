import { describe, it, expect } from 'vitest'
import { firstSentence, plainSpeech, speechFor } from '../speechText'

describe('plainSpeech', () => {
  it('drops fenced code blocks', () => {
    expect(plainSpeech('Before.\n```ts\nconst a = 1\n```\nAfter.')).toBe('Before. After.')
  })
  it('drops an unterminated fence', () => {
    expect(plainSpeech('Before.\n```ts\nconst a = 1')).toBe('Before.')
  })
  it('keeps inline code text', () => {
    expect(plainSpeech('Run `npm test` now')).toBe('Run npm test now')
  })
  it('keeps link text and drops the URL', () => {
    expect(plainSpeech('See [the docs](https://example.com/x) please')).toBe('See the docs please')
  })
  it('drops bare URLs', () => {
    expect(plainSpeech('Visit https://example.com/a?b=1 today')).toBe('Visit today')
  })
  it('drops headings, bullets and numbering', () => {
    expect(plainSpeech('## Summary\n- one\n- two\n1. three')).toBe('Summary. one. two. three')
  })
  it('drops bold and italic markers', () => {
    expect(plainSpeech('This is **bold** and *italic* and __under__')).toBe('This is bold and italic and under')
  })
  it('keeps snake_case words intact', () => {
    expect(plainSpeech('call my_func_name now')).toBe('call my_func_name now')
  })
  it('does not double up periods at line ends', () => {
    expect(plainSpeech('First line.\nSecond line.')).toBe('First line. Second line.')
  })
})

describe('firstSentence', () => {
  it('returns up to the first sentence end', () => {
    expect(firstSentence('One here. Two there.')).toBe('One here.')
  })
  it('returns the whole text when there is no terminator', () => {
    expect(firstSentence('no end here')).toBe('no end here')
  })
  it('caps a very long sentence', () => {
    expect(firstSentence('word '.repeat(200)).length).toBeLessThanOrEqual(285)
  })
})

describe('speechFor', () => {
  const reply = 'I fixed the bug. Then I added a test. Finally I ran everything.'
  it('first reads the first sentence', () => {
    expect(speechFor(reply, 'first', 'Claude')).toBe('I fixed the bug.')
  })
  it('full reads the whole reply', () => {
    expect(speechFor(reply, 'full', 'Claude')).toBe(reply)
  })
  it('done says only the short line', () => {
    expect(speechFor(reply, 'done', 'Claude')).toBe('Claude finished.')
  })
  it('falls back to "<Agent> finished." for an empty reply', () => {
    expect(speechFor('', 'first', 'Rocky')).toBe('Rocky finished.')
    expect(speechFor('```\ncode only\n```', 'full', 'Claude')).toBe('Claude finished.')
  })
  it('caps very long text', () => {
    const long = 'This is a sentence. '.repeat(200)
    expect(speechFor(long, 'full', 'Claude').length).toBeLessThanOrEqual(1201)
    expect(speechFor('word '.repeat(300), 'first', 'Claude').length).toBeLessThanOrEqual(281)
  })
})
