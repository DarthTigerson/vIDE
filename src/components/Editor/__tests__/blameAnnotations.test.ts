import { describe, it, expect } from 'vitest'
import type { GitBlameLine } from '@/types/index'
import { computeBlameDecorations } from '../blameAnnotations'

function line(overrides: Partial<GitBlameLine> = {}): GitBlameLine {
  return {
    line: 1,
    hash: 'abcdef1234567890abcdef1234567890abcdef12',
    author: 'Ada Lovelace',
    authorTime: 1700000000,
    summary: 'Initial commit',
    ...overrides,
  }
}

describe('computeBlameDecorations', () => {
  it('produces one decoration spec per in-range blame line', () => {
    const specs = computeBlameDecorations([line({ line: 1 }), line({ line: 2 })], 2)
    expect(specs).toHaveLength(2)
    expect(specs[0].line).toBe(1)
    expect(specs[1].line).toBe(2)
  })

  it('includes the author and a relative date in the end-of-line content', () => {
    const [spec] = computeBlameDecorations([line({ authorTime: Math.floor(Date.now() / 1000) })], 1)
    expect(spec.content).toContain('Ada Lovelace')
    expect(spec.content).toContain('ago')
  })

  it('truncates a long summary in the inline content but not in the hover tooltip', () => {
    const longSummary = 'A'.repeat(120)
    const [spec] = computeBlameDecorations([line({ summary: longSummary })], 1)
    expect(spec.content.length).toBeLessThan(longSummary.length)
    expect(spec.content).toContain('…')
    expect(spec.hoverValue).toContain(longSummary)
  })

  it('falls back to a placeholder for an empty summary', () => {
    const [spec] = computeBlameDecorations([line({ summary: '' })], 1)
    expect(spec.content).toContain('(no commit message)')
    expect(spec.hoverValue).toContain('(no commit message)')
  })

  it('includes a short (7-char) hash in the hover tooltip', () => {
    const [spec] = computeBlameDecorations([line({ hash: 'abcdef1234567890abcdef1234567890abcdef12' })], 1)
    expect(spec.hoverValue).toContain('abcdef1')
    expect(spec.hoverValue).not.toContain('abcdef1234567890abcdef1234567890abcdef12')
  })

  it('drops lines outside the current model\'s line range (no live remap in v1)', () => {
    const specs = computeBlameDecorations([line({ line: 1 }), line({ line: 5 }), line({ line: 0 })], 2)
    expect(specs.map((s) => s.line)).toEqual([1])
  })

  it('returns an empty array for no blame lines', () => {
    expect(computeBlameDecorations([], 10)).toEqual([])
  })
})
