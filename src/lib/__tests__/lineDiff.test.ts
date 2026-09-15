import { describe, it, expect } from 'vitest'
import { computeLineChanges, computeInlineRanges, computeInlineDiffs, computeDiff } from '../lineDiff'

describe('computeLineChanges', () => {
  it('returns nothing for identical content', () => {
    expect(computeLineChanges('a\nb\nc\n', 'a\nb\nc\n')).toEqual([])
  })

  it('marks a pure addition at the new line range', () => {
    const changes = computeLineChanges('a\nb\n', 'a\nb\nc\nd\n')
    expect(changes).toEqual([{ type: 'added', startLine: 3, endLine: 4 }])
  })

  it('marks a replaced line as modified', () => {
    const changes = computeLineChanges('a\nb\nc\n', 'a\nX\nc\n')
    expect(changes).toEqual([{ type: 'modified', startLine: 2, endLine: 2 }])
  })

  it('marks a pure deletion at the line before the gap', () => {
    const changes = computeLineChanges('a\nb\nc\n', 'a\nc\n')
    expect(changes).toEqual([{ type: 'deleted', startLine: 1, endLine: 1 }])
  })

  it('marks a deletion at the very start of the file as line 1', () => {
    const changes = computeLineChanges('a\nb\n', 'b\n')
    expect(changes).toEqual([{ type: 'deleted', startLine: 1, endLine: 1 }])
  })

  it('treats every line as added for a new/untracked file (empty HEAD content)', () => {
    const changes = computeLineChanges('', 'a\nb\n')
    expect(changes).toEqual([{ type: 'added', startLine: 1, endLine: 2 }])
  })

  it('handles multiple independent hunks', () => {
    const head = 'a\nb\nc\nd\ne\n'
    const current = 'a\nX\nc\nd\ne\nf\n'
    const changes = computeLineChanges(head, current)
    expect(changes).toEqual([
      { type: 'modified', startLine: 2, endLine: 2 },
      { type: 'added', startLine: 6, endLine: 6 },
    ])
  })

  it('ignores a lone trailing-newline difference (common for files missing a final newline at HEAD)', () => {
    expect(computeLineChanges('a\nb\nc', 'a\nb\nc\n')).toEqual([])
    expect(computeLineChanges('a\nb\nc\n', 'a\nb\nc')).toEqual([])
  })

  it('ignores CRLF vs LF differences alone (e.g. autocrlf-converted checkouts)', () => {
    expect(computeLineChanges('a\r\nb\r\nc\r\n', 'a\nb\nc\n')).toEqual([])
  })
})

describe('computeInlineRanges', () => {
  it('returns nothing for identical lines', () => {
    expect(computeInlineRanges('const foo = 1;', 'const foo = 1;')).toEqual([])
  })

  it('highlights just the changed token, not the whole line', () => {
    const oldLine = 'const foo = 1;'
    const newLine = 'const foo = 2;'
    const ranges = computeInlineRanges(oldLine, newLine)
    expect(ranges).toEqual([{ startColumn: 13, endColumn: 14 }])
    expect(newLine.slice(ranges[0].startColumn - 1, ranges[0].endColumn - 1)).toBe('2')
  })

  it('highlights an inserted word (and its trailing space) in place', () => {
    const oldLine = 'hello world'
    const newLine = 'hello brave world'
    const ranges = computeInlineRanges(oldLine, newLine)
    expect(ranges).toEqual([{ startColumn: 7, endColumn: 13 }])
    expect(newLine.slice(ranges[0].startColumn - 1, ranges[0].endColumn - 1)).toBe('brave ')
  })

  it('returns multiple ranges when changed words are not adjacent', () => {
    const oldLine = 'foo bar baz'
    const newLine = 'foo qux quux baz'
    const ranges = computeInlineRanges(oldLine, newLine)
    const substrings = ranges.map((r) => newLine.slice(r.startColumn - 1, r.endColumn - 1))
    expect(substrings).toEqual(['qux', 'quux '])
  })

  it('treats a line with no old counterpart as fully added', () => {
    const newLine = 'new text'
    const ranges = computeInlineRanges('', newLine)
    expect(ranges).toEqual([{ startColumn: 1, endColumn: 9 }])
  })
})

describe('computeInlineDiffs', () => {
  it('returns no inline diffs for identical content', () => {
    expect(computeInlineDiffs('a\nb\nc\n', 'a\nb\nc\n')).toEqual([])
  })

  it('pairs a single modified line with its inline ranges', () => {
    const diffs = computeInlineDiffs('a\nb\nc\n', 'a\nX\nc\n')
    expect(diffs).toEqual([{ line: 2, ranges: [{ startColumn: 1, endColumn: 2 }] }])
  })

  it('never runs on pure additions or deletions', () => {
    expect(computeInlineDiffs('a\nb\n', 'a\nb\nc\nd\n')).toEqual([])
    expect(computeInlineDiffs('a\nb\nc\n', 'a\nc\n')).toEqual([])
  })

  it('pairs old/new lines by index when a hunk replaces N lines with M != N lines, leaving extras uncovered', () => {
    // 2 old lines (b, c) replaced by 4 new lines (W, X, Y, Z): only the first
    // 2 new lines have an old counterpart to diff against, so only those get
    // an inline entry - Y and Z stay gutter-'modified'-only, same as always.
    const diffs = computeInlineDiffs('a\nb\nc\nd\n', 'a\nW\nX\nY\nZ\nd\n')
    expect(diffs).toEqual([
      { line: 2, ranges: [{ startColumn: 1, endColumn: 2 }] },
      { line: 3, ranges: [{ startColumn: 1, endColumn: 2 }] },
    ])
  })
})

describe('computeDiff', () => {
  it('combines computeLineChanges and computeInlineDiffs from a single pass', () => {
    const head = 'a\nb\nc\nd\ne\n'
    const current = 'a\nX\nc\nd\ne\nf\n'
    const result = computeDiff(head, current)
    expect(result.changes).toEqual(computeLineChanges(head, current))
    expect(result.inlineDiffs).toEqual(computeInlineDiffs(head, current))
  })
})
