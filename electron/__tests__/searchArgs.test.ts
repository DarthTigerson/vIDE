import { describe, it, expect } from 'vitest'
import { buildRgArgs, parseRgMessage, splitGlobs, type SearchOptions } from '../searchArgs'

const base: SearchOptions = {
  query: 'foo',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: '',
  exclude: '',
  skipPaths: [],
}

function matchLine(path: string, lineText: string, submatches: Array<[string, number, number]>, lineNumber = 1): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: path },
      lines: { text: lineText },
      line_number: lineNumber,
      absolute_offset: 0,
      submatches: submatches.map(([text, start, end]) => ({ match: { text }, start, end })),
    },
  })
}

describe('splitGlobs', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(splitGlobs(' src/**, *.ts ,, ')).toEqual(['src/**', '*.ts'])
  })

  it('returns an empty list for blank input', () => {
    expect(splitGlobs('   ')).toEqual([])
  })
})

describe('buildRgArgs', () => {
  it('always streams JSON, ignores the user config, and searches hidden files', () => {
    const args = buildRgArgs(base)
    expect(args).toContain('--json')
    expect(args).toContain('--no-config')
    expect(args).toContain('--hidden')
  })

  it('honours .gitignore even without a .git dir, but not ignore files of parent folders', () => {
    const args = buildRgArgs(base)
    expect(args).toContain('--no-require-git')
    expect(args).toContain('--no-ignore-parent')
  })

  it('treats the query as a literal unless regex is on', () => {
    expect(buildRgArgs(base)).toContain('--fixed-strings')
    expect(buildRgArgs({ ...base, regex: true })).not.toContain('--fixed-strings')
  })

  it('maps case sensitivity and whole-word', () => {
    expect(buildRgArgs(base)).toContain('--ignore-case')
    expect(buildRgArgs({ ...base, caseSensitive: true })).toContain('--case-sensitive')
    expect(buildRgArgs({ ...base, wholeWord: true })).toContain('--word-regexp')
    expect(buildRgArgs(base)).not.toContain('--word-regexp')
  })

  it('passes the query via -e so a leading dash is not read as a flag', () => {
    const args = buildRgArgs({ ...base, query: '--version' })
    const i = args.indexOf('-e')
    expect(args[i + 1]).toBe('--version')
  })

  // Searching "." from cwd=root (rather than an absolute path) keeps anchored
  // globs like `skip/**` working when the root goes through a symlink.
  it('searches "." last, after a -- separator', () => {
    const args = buildRgArgs(base)
    expect(args.slice(-2)).toEqual(['--', '.'])
  })

  it('always excludes the built-in ignored directories', () => {
    const args = buildRgArgs(base)
    expect(args).toContain('!node_modules')
    expect(args).toContain('!.git')
  })

  it('adds include globs as positive globs and exclude globs as negated ones', () => {
    const args = buildRgArgs({ ...base, include: 'src/**, *.ts', exclude: '**/*.test.ts' })
    const globs = args.flatMap((a, i) => (args[i - 1] === '--glob' ? [a] : []))
    expect(globs).toContain('src/**')
    expect(globs).toContain('*.ts')
    expect(globs).toContain('!**/*.test.ts')
  })

  it('caps file size at 2 MB like the old scanner', () => {
    const args = buildRgArgs(base)
    expect(args[args.indexOf('--max-filesize') + 1]).toBe('2M')
  })
})

describe('parseRgMessage', () => {
  it('ignores non-match messages and malformed lines', () => {
    expect(parseRgMessage('not json')).toBeNull()
    expect(parseRgMessage(JSON.stringify({ type: 'begin', data: {} }))).toBeNull()
    expect(parseRgMessage(JSON.stringify({ type: 'end', data: {} }))).toBeNull()
  })

  it('turns a match into a hit with 1-based line and column', () => {
    const hits = parseRgMessage(matchLine('/p/a.ts', 'const foo = 1\n', [['foo', 6, 9]], 4))!
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ path: '/p/a.ts', line: 4, col: 7, length: 3, text: 'const foo = 1', matchStart: 6 })
  })

  it('emits one hit per submatch on the same line', () => {
    const hits = parseRgMessage(matchLine('/p/a.ts', 'foo foo\n', [['foo', 0, 3], ['foo', 4, 7]]))!
    expect(hits.map((h) => h.col)).toEqual([1, 5])
  })

  it('strips CRLF line endings', () => {
    const hits = parseRgMessage(matchLine('/p/a.ts', 'foo\r\n', [['foo', 0, 3]]))!
    expect(hits[0].text).toBe('foo')
  })

  it('converts UTF-8 byte offsets to UTF-16 columns for non-ASCII text', () => {
    // "é" is 2 bytes / 1 UTF-16 unit; "😀" is 4 bytes / 2 UTF-16 units.
    const line = 'é😀foo\n'
    const hits = parseRgMessage(matchLine('/p/a.ts', line, [['foo', 6, 9]]))!
    expect(hits[0].col).toBe(4) // é(1) + 😀(2) = 3 units before, so column 4
    expect(hits[0].text.slice(hits[0].matchStart, hits[0].matchStart + hits[0].length)).toBe('foo')
  })

  it('trims leading whitespace and keeps matchStart pointing at the match', () => {
    const hits = parseRgMessage(matchLine('/p/a.ts', '    return foo\n', [['foo', 11, 14]]))!
    expect(hits[0].text).toBe('return foo')
    expect(hits[0].text.slice(hits[0].matchStart, hits[0].matchStart + hits[0].length)).toBe('foo')
    expect(hits[0].col).toBe(12) // column is still the real one in the file
  })

  it('windows very long lines around the match instead of cutting the match off', () => {
    const long = 'x'.repeat(1000) + 'NEEDLE' + 'y'.repeat(1000)
    const hits = parseRgMessage(matchLine('/p/min.js', long + '\n', [['NEEDLE', 1000, 1006]]))!
    const h = hits[0]
    expect(h.text.length).toBeLessThanOrEqual(310)
    expect(h.text.slice(h.matchStart, h.matchStart + h.length)).toBe('NEEDLE')
    expect(h.col).toBe(1001)
  })

  it('skips matches whose path is not valid UTF-8 (bytes form)', () => {
    const line = JSON.stringify({
      type: 'match',
      data: { path: { bytes: 'Zm9v' }, lines: { text: 'foo\n' }, line_number: 1, submatches: [{ match: { text: 'foo' }, start: 0, end: 3 }] },
    })
    expect(parseRgMessage(line)).toBeNull()
  })
})
