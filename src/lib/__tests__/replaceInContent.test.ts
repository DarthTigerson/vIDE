import { describe, it, expect } from 'vitest'
import { replaceInContent, type ReplaceOptions } from '../replaceInContent'

const opts: ReplaceOptions = {
  query: 'needle',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  replacement: 'pin',
}

describe('replaceInContent', () => {
  it('replaces the match at each target (1-based line and column)', () => {
    const r = replaceInContent('one\nconst needle = 1\n', [{ line: 2, col: 7 }], opts)
    expect(r).toEqual({ content: 'one\nconst pin = 1\n', replaced: 1, skipped: 0 })
  })

  it('replaces several matches on one line without the earlier edits shifting the later columns', () => {
    const r = replaceInContent('needle and needle and needle', [
      { line: 1, col: 1 }, { line: 1, col: 12 }, { line: 1, col: 23 },
    ], { ...opts, replacement: 'a much longer replacement' })
    expect(r.content).toBe('a much longer replacement and a much longer replacement and a much longer replacement')
    expect(r.replaced).toBe(3)
  })

  it('only touches the targets it is given', () => {
    const r = replaceInContent('needle\nneedle\nneedle', [{ line: 2, col: 1 }], opts)
    expect(r.content).toBe('needle\npin\nneedle')
  })

  it('preserves CRLF and LF line endings exactly', () => {
    expect(replaceInContent('a\r\nneedle\r\nb', [{ line: 2, col: 1 }], opts).content).toBe('a\r\npin\r\nb')
    expect(replaceInContent('a\nneedle\nb', [{ line: 2, col: 1 }], opts).content).toBe('a\npin\nb')
  })

  it('handles UTF-16 columns after emoji and accents', () => {
    const r = replaceInContent('é😀 needle', [{ line: 1, col: 5 }], opts)
    expect(r.content).toBe('é😀 pin')
  })

  it('treats the replacement literally when regex is off ($ is not special)', () => {
    const r = replaceInContent('needle', [{ line: 1, col: 1 }], { ...opts, replacement: '$1 & $&' })
    expect(r.content).toBe('$1 & $&')
  })

  it('expands capture groups and $& when regex is on', () => {
    const r = replaceInContent('foo(1) foo(22)', [{ line: 1, col: 1 }, { line: 1, col: 8 }], {
      ...opts, query: 'foo\\((\\d+)\\)', regex: true, replacement: 'bar[$1] <$&>',
    })
    expect(r.content).toBe('bar[1] <foo(1)> bar[22] <foo(22)>')
  })

  it('replaces with nothing when the replacement is empty', () => {
    expect(replaceInContent('a needle b', [{ line: 1, col: 3 }], { ...opts, replacement: '' }).content).toBe('a  b')
  })

  it('respects case and whole-word rules when re-checking a target', () => {
    const cs = { ...opts, caseSensitive: true }
    expect(replaceInContent('NEEDLE', [{ line: 1, col: 1 }], cs)).toMatchObject({ replaced: 0, skipped: 1 })
    const ww = { ...opts, wholeWord: true }
    expect(replaceInContent('needles', [{ line: 1, col: 1 }], ww)).toMatchObject({ replaced: 0, skipped: 1 })
    expect(replaceInContent('a needle', [{ line: 1, col: 3 }], ww)).toMatchObject({ replaced: 1, skipped: 0 })
  })

  it('skips (and counts) targets whose line changed since the search, instead of replacing blindly', () => {
    const r = replaceInContent('something else entirely', [{ line: 1, col: 1 }], opts)
    expect(r).toEqual({ content: 'something else entirely', replaced: 0, skipped: 1 })
  })

  it('skips targets that point outside the file', () => {
    expect(replaceInContent('needle', [{ line: 5, col: 1 }], opts)).toMatchObject({ replaced: 0, skipped: 1 })
    expect(replaceInContent('needle', [{ line: 1, col: 99 }], opts)).toMatchObject({ replaced: 0, skipped: 1 })
  })

  it('never replaces an empty (zero-width) regex match, which would just insert text', () => {
    const r = replaceInContent('abc', [{ line: 1, col: 1 }], { ...opts, query: 'x*', regex: true, replacement: 'INSERTED' })
    expect(r).toEqual({ content: 'abc', replaced: 0, skipped: 1 })
  })

  it('rejects a column of 0 or below instead of treating it as the start of the line', () => {
    expect(replaceInContent('needle', [{ line: 1, col: 0 }], opts)).toMatchObject({ content: 'needle', replaced: 0, skipped: 1 })
    expect(replaceInContent('needle', [{ line: 1, col: -3 }], opts)).toMatchObject({ content: 'needle', replaced: 0, skipped: 1 })
  })

  it('rejects a line of 0 or below', () => {
    expect(replaceInContent('needle', [{ line: 0, col: 1 }], opts)).toMatchObject({ content: 'needle', replaced: 0, skipped: 1 })
  })

  it('counts a mix of replaced and stale targets separately', () => {
    const r = replaceInContent('needle\nchanged\nneedle', [
      { line: 1, col: 1 }, { line: 2, col: 1 }, { line: 3, col: 1 },
    ], opts)
    expect(r).toEqual({ content: 'pin\nchanged\npin', replaced: 2, skipped: 1 })
  })

  it('applies a duplicated target only once', () => {
    const r = replaceInContent('needle', [{ line: 1, col: 1 }, { line: 1, col: 1 }], opts)
    expect(r).toMatchObject({ content: 'pin', replaced: 1 })
  })

  it('reports an invalid regex instead of throwing, changing nothing', () => {
    const r = replaceInContent('needle', [{ line: 1, col: 1 }], { ...opts, query: '(oops', regex: true })
    expect(r.error).toBeTruthy()
    expect(r).toMatchObject({ content: 'needle', replaced: 0 })
  })

  it('returns the content untouched when there are no targets', () => {
    expect(replaceInContent('needle', [], opts)).toEqual({ content: 'needle', replaced: 0, skipped: 0 })
  })
})
