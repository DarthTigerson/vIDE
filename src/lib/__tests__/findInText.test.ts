import { describe, it, expect } from 'vitest'
import { findMatches, replacementFor, type FindOptions } from '../findInText'

const opts: FindOptions = { query: 'path', caseSensitive: false, wholeWord: false, regex: false }

describe('findMatches', () => {
  it('returns 1-based line and column with the exact match length', () => {
    const r = findMatches('one\nconst path = 1\n', opts)
    expect(r).toEqual({ matches: [{ line: 2, col: 7, length: 4 }], truncated: false })
  })

  it('finds every match on a line, in order, across lines', () => {
    const r = findMatches('path path\nx\npath', opts)
    expect(r.matches.map((m) => [m.line, m.col])).toEqual([[1, 1], [1, 6], [3, 1]])
  })

  it('handles CRLF content', () => {
    expect(findMatches('a\r\npath\r\n', opts).matches).toEqual([{ line: 2, col: 1, length: 4 }])
  })

  it('counts columns in UTF-16 units after emoji and accents', () => {
    expect(findMatches('é😀 path', opts).matches).toEqual([{ line: 1, col: 5, length: 4 }])
  })

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(findMatches('PATH', opts).matches).toHaveLength(1)
    expect(findMatches('PATH', { ...opts, caseSensitive: true }).matches).toHaveLength(0)
  })

  it('treats the query literally unless regex is on', () => {
    expect(findMatches('a.c abc', { ...opts, query: 'a.c' }).matches).toHaveLength(1)
    expect(findMatches('a.c abc', { ...opts, query: 'a.c', regex: true }).matches).toHaveLength(2)
  })

  it('supports whole-word matching', () => {
    const r = findMatches('paths path (path) my_path', { ...opts, wholeWord: true })
    expect(r.matches.map((m) => m.col)).toEqual([7, 13])
  })

  it('reports the real length of a regex match', () => {
    const r = findMatches('id_1234 x', { ...opts, query: 'id_\\d+', regex: true })
    expect(r.matches).toEqual([{ line: 1, col: 1, length: 7 }])
  })

  it('reports an invalid regex instead of throwing', () => {
    const r = findMatches('x', { ...opts, query: '(oops', regex: true })
    expect(r.matches).toEqual([])
    expect(r.error).toBeTruthy()
  })

  it('finds nothing for an empty query, and skips empty regex matches', () => {
    expect(findMatches('abc', { ...opts, query: '' }).matches).toEqual([])
    expect(findMatches('abc', { ...opts, query: 'x*', regex: true }).matches).toEqual([])
  })

  it('stops at the limit and says so', () => {
    const r = findMatches('path\n'.repeat(50), opts, 10)
    expect(r.matches).toHaveLength(10)
    expect(r.truncated).toBe(true)
  })
})

describe('replacementFor', () => {
  const rep = (line: string, col: number, o: Partial<FindOptions> & { replacement: string }) =>
    replacementFor(line, col, { ...opts, ...o })

  it('gives the match length and the text it becomes', () => {
    expect(rep('const path = 1', 7, { replacement: 'filePath' })).toEqual({ length: 4, text: 'filePath' })
  })

  it('treats the replacement literally when regex is off', () => {
    expect(rep('path', 1, { replacement: '$1 $&' })).toEqual({ length: 4, text: '$1 $&' })
  })

  it('expands capture groups and $& when regex is on', () => {
    expect(rep('foo(12)', 1, { query: 'foo\\((\\d+)\\)', regex: true, replacement: 'bar[$1] <$&>' }))
      .toEqual({ length: 7, text: 'bar[12] <foo(12)>' })
  })

  it('uses the whole line as context, so look-around still works', () => {
    expect(rep('a1 b1', 5, { query: '(?<=b)1', regex: true, replacement: '2' })).toEqual({ length: 1, text: '2' })
  })

  it('allows an empty replacement', () => {
    expect(rep('a path b', 3, { replacement: '' })).toEqual({ length: 4, text: '' })
  })

  it('returns null when nothing matches at that column any more', () => {
    expect(rep('something else', 1, { replacement: 'x' })).toBeNull()
    expect(rep('path', 0, { replacement: 'x' })).toBeNull()
    expect(rep('path', 99, { replacement: 'x' })).toBeNull()
  })

  it('returns null for an empty match or an invalid regex', () => {
    expect(rep('abc', 1, { query: 'x*', regex: true, replacement: 'I' })).toBeNull()
    expect(rep('abc', 1, { query: '(oops', regex: true, replacement: 'I' })).toBeNull()
  })

  it('respects case and whole-word when re-checking', () => {
    expect(rep('PATH', 1, { caseSensitive: true, replacement: 'x' })).toBeNull()
    expect(rep('paths', 1, { wholeWord: true, replacement: 'x' })).toBeNull()
  })
})
