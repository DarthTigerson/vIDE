import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SearchManager } from '../search'
import type { SearchDone, SearchHit, SearchOptions } from '../searchArgs'

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
