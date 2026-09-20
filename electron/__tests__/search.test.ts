import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SearchManager } from '../search'
import type { SearchDone, SearchHit, SearchOptions } from '../searchArgs'
import { pathAllowed } from '../../src/lib/searchInMemory'
import { replaceInContent } from '../../src/lib/replaceInContent'
import { readFile } from 'fs/promises'

const base: SearchOptions = {
  query: 'needle',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: '',
  exclude: '',
  skipPaths: [],
}

let root: string

async function put(rel: string, content: string) {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
  return full
}

function run(options: Partial<SearchOptions> = {}, maxMatches?: number): Promise<{ hits: SearchHit[]; done: SearchDone }> {
  return new Promise((resolve) => {
    const hits: SearchHit[] = []
    const manager = new SearchManager(
      (batch) => hits.push(...batch.hits),
      (done) => resolve({ hits, done }),
      maxMatches ? { maxMatches } : undefined,
    )
    manager.start('s1', root, { ...base, ...options })
  })
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vide-search-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('SearchManager (real ripgrep)', () => {
  it('finds matches across files with line, column and counts', async () => {
    const a = await put('src/a.ts', 'one\nconst needle = 1\n')
    await put('src/b.ts', 'nothing here\n')
    const { hits, done } = await run()
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ path: a, line: 2, col: 7, length: 6 })
    expect(done).toMatchObject({ searchId: 's1', fileCount: 1, matchCount: 1, truncated: false })
    expect(done.error).toBeUndefined()
  })

  it('is case-insensitive by default and case-sensitive on request', async () => {
    await put('a.txt', 'NEEDLE\n')
    expect((await run()).hits).toHaveLength(1)
    expect((await run({ caseSensitive: true })).hits).toHaveLength(0)
  })

  it('respects .gitignore and always skips node_modules and .git', async () => {
    await put('.gitignore', 'ignored.txt\n')
    await put('ignored.txt', 'needle\n')
    await put('node_modules/pkg/index.js', 'needle\n')
    await put('.git/config', 'needle\n')
    const kept = await put('kept.txt', 'needle\n')
    const { hits } = await run()
    expect(hits.map((h) => h.path)).toEqual([kept])
  })

  it('searches hidden files that are not ignored', async () => {
    const hidden = await put('.github/workflows/ci.yml', 'needle\n')
    expect((await run()).hits.map((h) => h.path)).toEqual([hidden])
  })

  it('does not report files listed in skipPaths (unsaved tabs searched from memory)', async () => {
    const skipped = await put('a.txt', 'needle\n')
    const kept = await put('b.txt', 'needle\n')
    const { hits, done } = await run({ skipPaths: [skipped] })
    expect(hits.map((h) => h.path)).toEqual([kept])
    expect(done.matchCount).toBe(1)
    expect(done.fileCount).toBe(1)
  })

  it('supports whole-word matching', async () => {
    await put('a.txt', 'needles\nneedle\n')
    const { hits } = await run({ wholeWord: true })
    expect(hits.map((h) => h.line)).toEqual([2])
  })

  it('supports regex queries and treats the query literally otherwise', async () => {
    await put('a.txt', 'needle1\nneedle22\na.c\n')
    expect((await run({ query: 'needle\\d+', regex: true })).hits).toHaveLength(2)
    // "." must be literal without the regex flag
    expect((await run({ query: 'a.c' })).hits).toHaveLength(1)
    expect((await run({ query: 'a.c', regex: true })).hits).toHaveLength(1)
  })

  it('reports an invalid regex as an error instead of throwing', async () => {
    await put('a.txt', 'needle\n')
    const { hits, done } = await run({ query: '(unclosed', regex: true })
    expect(hits).toHaveLength(0)
    expect(done.error).toMatch(/regex|parse|unclosed/i)
  })

  it('applies include and exclude globs', async () => {
    const ts = await put('a.ts', 'needle\n')
    await put('a.md', 'needle\n')
    await put('skip/a.ts', 'needle\n')
    const { hits } = await run({ include: '*.ts', exclude: 'skip/**' })
    expect(hits.map((h) => h.path)).toEqual([ts])
  })

  it('reports every match on a line', async () => {
    await put('a.txt', 'needle needle\n')
    const { hits } = await run()
    expect(hits.map((h) => h.col)).toEqual([1, 8])
  })

  it('stops at the cap and flags the result as truncated', async () => {
    await put('a.txt', 'needle\n'.repeat(500))
    const { hits, done } = await run({}, 50)
    expect(done.truncated).toBe(true)
    expect(done.matchCount).toBe(50)
    expect(hits).toHaveLength(50)
  })

  it('cancels the previous search when a new one starts', async () => {
    await put('a.txt', 'needle\n')
    const dones: SearchDone[] = []
    const seen: string[] = []
    const manager = new SearchManager(
      (batch) => seen.push(batch.searchId),
      (d) => dones.push(d),
    )
    manager.start('first', root, base)
    manager.start('second', root, base)
    await new Promise((r) => setTimeout(r, 500))
    expect(dones.map((d) => d.searchId)).toEqual(['second'])
    expect(seen.every((id) => id === 'second')).toBe(true)
  })

  it('emits nothing after an explicit cancel', async () => {
    await put('a.txt', 'needle\n')
    const dones: SearchDone[] = []
    const manager = new SearchManager(() => {}, (d) => dones.push(d))
    manager.start('s1', root, base)
    manager.cancel('s1')
    await new Promise((r) => setTimeout(r, 300))
    expect(dones).toHaveLength(0)
  })
})

// The renderer searches tabs with unsaved edits itself and must exclude exactly
// the files ripgrep would have. Run both over the same tree and compare.
describe('include/exclude parity: renderer pathAllowed vs real ripgrep', () => {
  const files = [
    'a.ts', 'a.md', 'src/a.ts', 'src/deep/b.ts', 'src/x.test.ts', 'src/deep/y.test.ts',
    'skip/a.ts', 'skipper/a.ts', 'docs/a.md', 'lib/c.tsx', 'node_modules/p/i.ts', '.github/ci.yml',
    'x/src/a.ts', 'x/docs/a.md', 'deep/skip/z.ts',
  ]
  const matrix: Array<[string, string]> = [
    ['*.ts', ''],
    ['src/**', ''],
    ['', 'skip'],
    ['', 'skip/'],
    ['*.{ts,md}', '**/*.test.ts'],
    ['src/*.ts', ''],
    ['', 'docs/**'],
    ['*.ts, *.md', 'src/deep'],
    ['a.?s', ''],
    ['', '*.test.ts'],
    ['**/deep/*.ts', ''],
    ['/a.ts', ''],
  ]

  for (const [include, exclude] of matrix) {
    it(`include=${JSON.stringify(include)} exclude=${JSON.stringify(exclude)}`, async () => {
      for (const f of files) await put(f, 'needle\n')
      const { hits } = await run({ include, exclude })
      const fromRg = [...new Set(hits.map((h) => h.path))].sort()
      const fromRenderer = files
        .map((f) => join(root, f))
        .filter((abs) => pathAllowed(abs, root, include, exclude))
        .sort()
      expect(fromRenderer).toEqual(fromRg)
    })
  }
})

// The riskiest seam of replace: ripgrep reports UTF-8 byte offsets that are
// converted to UTF-16 columns, and replaceInContent edits by those columns. Run
// the real search, feed its hits to the real replacer, write, and compare.
describe('search → replace round trip (real ripgrep, real files)', () => {
  async function replaceAllOnDisk(options: Partial<SearchOptions>, replacement: string) {
    const { hits } = await run(options)
    const byFile = new Map<string, SearchHit[]>()
    for (const h of hits) byFile.set(h.path, [...(byFile.get(h.path) ?? []), h])
    const full = { ...base, ...options }
    for (const [path, fileHits] of byFile) {
      const before = await readFile(path, 'utf-8')
      const result = replaceInContent(before, fileHits, { ...full, replacement })
      expect(result.skipped).toBe(0)
      await writeFile(path, result.content)
    }
    return byFile.size
  }

  it('rewrites every match exactly, across CRLF, emoji, accents and repeated hits on a line', async () => {
    const a = await put('a.txt', 'needle\r\né😀 needle needle\r\nplain\r\n')
    const b = await put('b.txt', 'ünïcödé needle, needle\nlast needle')
    const files = await replaceAllOnDisk({}, 'pin')
    expect(files).toBe(2)
    expect(await readFile(a, 'utf-8')).toBe('pin\r\né😀 pin pin\r\nplain\r\n')
    expect(await readFile(b, 'utf-8')).toBe('ünïcödé pin, pin\nlast pin')
  })

  it('honours case-insensitive matching when replacing different casings', async () => {
    const a = await put('a.txt', 'Needle NEEDLE needle\n')
    await replaceAllOnDisk({}, 'x')
    expect(await readFile(a, 'utf-8')).toBe('x x x\n')
  })

  it('expands capture groups from a regex search', async () => {
    const a = await put('a.txt', 'get(1) get(22)\n')
    await replaceAllOnDisk({ query: 'get\\((\\d+)\\)', regex: true }, 'fetch[$1]')
    expect(await readFile(a, 'utf-8')).toBe('fetch[1] fetch[22]\n')
  })

  it('only changes whole words when whole-word is on', async () => {
    const a = await put('a.txt', 'needles needle (needle) my_needle\n')
    await replaceAllOnDisk({ wholeWord: true }, 'X')
    expect(await readFile(a, 'utf-8')).toBe('needles X (X) my_needle\n')
  })

  it('leaves files that were not matched byte-for-byte identical', async () => {
    const untouched = await put('other.txt', 'nothing to see\r\nhere\n')
    await put('a.txt', 'needle\n')
    await replaceAllOnDisk({}, 'pin')
    expect(await readFile(untouched, 'utf-8')).toBe('nothing to see\r\nhere\n')
  })
})

