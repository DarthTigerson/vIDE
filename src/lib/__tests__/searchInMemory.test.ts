import { describe, it, expect } from 'vitest'
import { searchInMemory, globMatches, pathAllowed, type InMemoryOptions } from '../searchInMemory'

const opts: InMemoryOptions = {
  query: 'needle',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: '',
  exclude: '',
}

describe('searchInMemory', () => {
  it('finds matches with 1-based line and column and the same text shape as rg hits', () => {
    const r = searchInMemory('one\n  const needle = 1\n', '/p/a.ts', opts)
    expect(r.error).toBeUndefined()
    expect(r.hits).toEqual([
      { path: '/p/a.ts', line: 2, col: 9, length: 6, text: 'const needle = 1', matchStart: 6 },
    ])
  })

  it('reports every match on a line', () => {
    const r = searchInMemory('needle needle', '/p/a.ts', opts)
    expect(r.hits.map((h) => h.col)).toEqual([1, 8])
  })

  it('is case-insensitive unless asked otherwise', () => {
    expect(searchInMemory('NEEDLE', '/p/a', opts).hits).toHaveLength(1)
    expect(searchInMemory('NEEDLE', '/p/a', { ...opts, caseSensitive: true }).hits).toHaveLength(0)
  })

  it('treats the query literally unless regex is on', () => {
    expect(searchInMemory('a.c\nabc', '/p/a', { ...opts, query: 'a.c' }).hits).toHaveLength(1)
    expect(searchInMemory('a.c\nabc', '/p/a', { ...opts, query: 'a.c', regex: true }).hits).toHaveLength(2)
  })

  it('supports whole-word matching', () => {
    const r = searchInMemory('needles\nneedle\nmy_needle\n(needle)', '/p/a', { ...opts, wholeWord: true })
    expect(r.hits.map((h) => h.line)).toEqual([2, 4])
  })

  it('returns an error instead of throwing for an invalid regex', () => {
    const r = searchInMemory('x', '/p/a', { ...opts, query: '(unclosed', regex: true })
    expect(r.hits).toEqual([])
    expect(r.error).toBeTruthy()
  })

  it('does not loop forever on patterns that can match the empty string', () => {
    const r = searchInMemory('abc', '/p/a', { ...opts, query: 'x*', regex: true })
    expect(r.hits).toEqual([]) // empty matches are not results
  })

  it('handles CRLF content', () => {
    const r = searchInMemory('a\r\nneedle\r\n', '/p/a', opts)
    expect(r.hits[0]).toMatchObject({ line: 2, text: 'needle' })
  })

  it('windows very long lines around the match', () => {
    const long = 'x'.repeat(1000) + 'NEEDLE' + 'y'.repeat(1000)
    const h = searchInMemory(long, '/p/min.js', opts).hits[0]
    expect(h.text.length).toBeLessThanOrEqual(310)
    expect(h.text.slice(h.matchStart, h.matchStart + h.length)).toBe('NEEDLE')
    expect(h.col).toBe(1001)
  })
})

describe('globMatches (gitignore-style, like ripgrep --glob)', () => {
  it('matches a slashless pattern against the basename at any depth', () => {
    expect(globMatches('*.ts', 'a.ts')).toBe(true)
    expect(globMatches('*.ts', 'src/deep/a.ts')).toBe(true)
    expect(globMatches('*.ts', 'a.tsx')).toBe(false)
  })

  it('anchors patterns containing a slash to the root', () => {
    expect(globMatches('src/*.ts', 'src/a.ts')).toBe(true)
    expect(globMatches('src/*.ts', 'x/src/a.ts')).toBe(false)
    expect(globMatches('src/*.ts', 'src/deep/a.ts')).toBe(false)
  })

  it('supports ** across directories', () => {
    expect(globMatches('src/**', 'src/a/b/c.ts')).toBe(true)
    expect(globMatches('**/*.test.ts', 'a/b/c.test.ts')).toBe(true)
    expect(globMatches('**/*.test.ts', 'c.test.ts')).toBe(true)
  })

  it('matches a directory name against anything beneath it', () => {
    expect(globMatches('skip', 'skip/a.ts')).toBe(true)
    expect(globMatches('skip', 'x/skip/a.ts')).toBe(true)
    expect(globMatches('skip', 'skipper/a.ts')).toBe(false)
  })

  it('supports ?, [] classes and {a,b} alternation', () => {
    expect(globMatches('a?.ts', 'ab.ts')).toBe(true)
    expect(globMatches('[ab].ts', 'b.ts')).toBe(true)
    expect(globMatches('*.{ts,tsx}', 'a.tsx')).toBe(true)
    expect(globMatches('*.{ts,tsx}', 'a.js')).toBe(false)
  })

  it('escapes regex metacharacters in the pattern', () => {
    expect(globMatches('a.b', 'aXb')).toBe(false)
    expect(globMatches('a+b', 'a+b')).toBe(true)
  })
})

describe('pathAllowed', () => {
  const root = '/proj'

  it('rejects paths outside the project root', () => {
    expect(pathAllowed('/other/a.ts', root, '', '')).toBe(false)
  })

  it('rejects the built-in ignored directories', () => {
    expect(pathAllowed('/proj/node_modules/x/a.js', root, '', '')).toBe(false)
    expect(pathAllowed('/proj/.git/config', root, '', '')).toBe(false)
    expect(pathAllowed('/proj/src/a.ts', root, '', '')).toBe(true)
  })

  it('applies include globs (must match at least one) and exclude globs (must match none)', () => {
    expect(pathAllowed('/proj/a.ts', root, '*.ts', '')).toBe(true)
    expect(pathAllowed('/proj/a.md', root, '*.ts', '')).toBe(false)
    expect(pathAllowed('/proj/skip/a.ts', root, '*.ts', 'skip/**')).toBe(false)
    expect(pathAllowed('/proj/a.ts', root, '*.ts', 'skip/**')).toBe(true)
  })
})
