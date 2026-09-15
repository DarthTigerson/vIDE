import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseBlamePorcelain, getFileBlame } from '../git'

const execFileAsync = promisify(execFile)

// Shaped like real `git blame --line-porcelain` output (--line-porcelain, as
// opposed to plain --porcelain, repeats every metadata field above every
// single line - see the comment on parseBlamePorcelain in ../git.ts) for two
// commits: an initial commit adding two lines, then a second commit adding
// two more. Hashes/authors/emails are fictitious, not lifted from this
// repo's real history.
const REALISTIC_BLAME = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2',
  'author Ada Lovelace',
  'author-mail <ada@example.com>',
  'author-time 1700000000',
  'author-tz +0000',
  'committer Ada Lovelace',
  'committer-mail <ada@example.com>',
  'committer-time 1700000000',
  'committer-tz +0000',
  'summary Initial commit',
  'boundary',
  'filename src/example.ts',
  "\timport { readFile } from 'fs'",
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2 2',
  'author Ada Lovelace',
  'author-mail <ada@example.com>',
  'author-time 1700000000',
  'author-tz +0000',
  'committer Ada Lovelace',
  'committer-mail <ada@example.com>',
  'committer-time 1700000000',
  'committer-tz +0000',
  'summary Initial commit',
  'boundary',
  'filename src/example.ts',
  '\t',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3 3 2',
  'author Grace Hopper',
  'author-mail <grace@example.com>',
  'author-time 1701000000',
  'author-tz +0000',
  'committer Grace Hopper',
  'committer-mail <grace@example.com>',
  'committer-time 1701000500',
  'committer-tz +0000',
  'summary Add repo discovery for multi-repo projects',
  'previous cccccccccccccccccccccccccccccccccccccccc src/example.ts',
  'filename src/example.ts',
  '\texport function discoverRepos() {',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 4 4',
  'author Grace Hopper',
  'author-mail <grace@example.com>',
  'author-time 1701000000',
  'author-tz +0000',
  'committer Grace Hopper',
  'committer-mail <grace@example.com>',
  'committer-time 1701000500',
  'committer-tz +0000',
  'summary Add repo discovery for multi-repo projects',
  'previous cccccccccccccccccccccccccccccccccccccccc src/example.ts',
  'filename src/example.ts',
  '\t  return []',
].join('\n')

describe('parseBlamePorcelain', () => {
  it('returns an empty array for empty input', () => {
    expect(parseBlamePorcelain('')).toEqual([])
  })

  it('parses a realistic --line-porcelain transcript spanning two commits', () => {
    expect(parseBlamePorcelain(REALISTIC_BLAME)).toEqual([
      { line: 1, hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', author: 'Ada Lovelace', authorTime: 1700000000, summary: 'Initial commit' },
      { line: 2, hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', author: 'Ada Lovelace', authorTime: 1700000000, summary: 'Initial commit' },
      { line: 3, hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', author: 'Grace Hopper', authorTime: 1701000000, summary: 'Add repo discovery for multi-repo projects' },
      { line: 4, hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', author: 'Grace Hopper', authorTime: 1701000000, summary: 'Add repo discovery for multi-repo projects' },
    ])
  })

  // Real `--line-porcelain` output always repeats full metadata (see the
  // comment on parseBlamePorcelain), but the parser also carries a
  // metaByHash fallback for defensiveness - this synthesizes the case that
  // fallback exists for (a repeat line missing metadata) rather than relying
  // on git to ever actually produce it.
  it('falls back to a previously-seen commit\'s metadata when a repeat line omits it', () => {
    const raw = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2',
      'author Ada Lovelace',
      'author-time 1700000000',
      'summary Initial commit',
      '\tline one',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2 2',
      '\tline two',
    ].join('\n')

    expect(parseBlamePorcelain(raw)).toEqual([
      { line: 1, hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', author: 'Ada Lovelace', authorTime: 1700000000, summary: 'Initial commit' },
      { line: 2, hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', author: 'Ada Lovelace', authorTime: 1700000000, summary: 'Initial commit' },
    ])
  })

  it('tolerates a line whose content itself looks like a metadata field (only a leading tab marks content)', () => {
    const raw = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1',
      'author Ada Lovelace',
      'author-time 1700000000',
      'summary Initial commit',
      "\tconst summary = 'author-time is not a real field here'",
    ].join('\n')

    expect(parseBlamePorcelain(raw)).toEqual([
      { line: 1, hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', author: 'Ada Lovelace', authorTime: 1700000000, summary: 'Initial commit' },
    ])
  })
})

describe('getFileBlame', () => {
  let repoRoot: string

  beforeAll(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'git-blame-'))
    await execFileAsync('git', ['init', '-q'], { cwd: repoRoot })
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoRoot })
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot })

    await writeFile(join(repoRoot, 'a.txt'), 'one\ntwo\n')
    await execFileAsync('git', ['add', 'a.txt'], { cwd: repoRoot })
    await execFileAsync('git', ['commit', '-q', '-m', 'first commit'], { cwd: repoRoot })

    await writeFile(join(repoRoot, 'a.txt'), 'one\ntwo\nthree\n')
    await execFileAsync('git', ['add', 'a.txt'], { cwd: repoRoot })
    await execFileAsync('git', ['commit', '-q', '-m', 'second commit'], { cwd: repoRoot })
  })

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  it('attributes each line to the commit that last touched it, and resolves the HEAD commit', async () => {
    const { stdout: head } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
    const result = await getFileBlame(repoRoot, 'a.txt')

    expect(result.headCommit).toBe(head.trim())
    expect(result.lines).toHaveLength(3)
    expect(result.lines.map((l) => l.line)).toEqual([1, 2, 3])
    expect(result.lines[0].summary).toBe('first commit')
    expect(result.lines[1].summary).toBe('first commit')
    expect(result.lines[2].summary).toBe('second commit')
    expect(result.lines[0].hash).toBe(result.lines[1].hash)
    expect(result.lines[2].hash).not.toBe(result.lines[0].hash)
    expect(result.lines[2].hash).toBe(head.trim())
    expect(result.lines.every((l) => l.author === 'Test')).toBe(true)
    expect(result.lines.every((l) => l.authorTime > 0)).toBe(true)
  })

  it('resolves an empty result for a path that does not exist', async () => {
    const result = await getFileBlame(repoRoot, 'no-such-file.txt')
    expect(result.lines).toEqual([])
  })
})
