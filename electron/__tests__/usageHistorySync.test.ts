import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { groupByDay, isUsagePath, shardsToPull, syncUsageHistory } from '../usageHistorySync'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 10, 13, 12)
const line = (ts: number) => JSON.stringify({ ts })
const tsOf = (content: string) => content.trim().split('\n').map((l) => JSON.parse(l).ts)

describe('isUsagePath', () => {
  it('matches the legacy file and daily shards only', () => {
    expect(isUsagePath('usage-history.jsonl')).toBe(true)
    expect(isUsagePath('usage-history/2026-11-13.jsonl')).toBe(true)
    expect(isUsagePath('notes/usage-history.jsonl')).toBe(false)
    expect(isUsagePath('general.json')).toBe(false)
  })
})

describe('groupByDay', () => {
  it('buckets lines by UTC day', () => {
    const byDay = groupByDay([line(T0), line(T0 + 1000), line(T0 + DAY)])
    expect([...byDay.keys()]).toEqual(['2026-11-13', '2026-11-14'])
    expect(byDay.get('2026-11-13')).toHaveLength(2)
  })
})

describe('shardsToPull', () => {
  it('pulls days missing locally plus the last two days, skipping older days already present', () => {
    const remote = ['2026-11-01.jsonl', '2026-11-10.jsonl', '2026-11-12.jsonl', '2026-11-13.jsonl']
    const local = new Set(['2026-11-01', '2026-11-12', '2026-11-13'])
    expect(shardsToPull(remote, local, T0)).toEqual(['2026-11-10.jsonl', '2026-11-12.jsonl', '2026-11-13.jsonl'])
  })
})

describe('syncUsageHistory', () => {
  let root: string
  let localFile: string
  let repo: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vide-usage-'))
    localFile = join(root, 'usage-history.jsonl')
    repo = join(root, 'repo')
    mkdirSync(repo)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('folds the legacy file into daily shards, removes it, and merges into the local file', () => {
    writeFileSync(join(repo, 'usage-history.jsonl'), [line(T0 - DAY), line(T0)].join('\n') + '\n')
    writeFileSync(localFile, line(T0 + 1000) + '\n')
    return syncUsageHistory(localFile, repo).then(() => {
      expect(existsSync(join(repo, 'usage-history.jsonl'))).toBe(false)
      expect(readdirSync(join(repo, 'usage-history')).sort()).toEqual(['2026-11-12.jsonl', '2026-11-13.jsonl'])
      expect(tsOf(readFileSync(join(repo, 'usage-history', '2026-11-13.jsonl'), 'utf8'))).toEqual([T0, T0 + 1000])
      expect(tsOf(readFileSync(localFile, 'utf8'))).toEqual([T0 - DAY, T0, T0 + 1000])
    })
  })

  it('leaves untouched shards byte-identical', async () => {
    mkdirSync(join(repo, 'usage-history'))
    const old = line(T0 - DAY) + '\n'
    writeFileSync(join(repo, 'usage-history', '2026-11-12.jsonl'), old)
    writeFileSync(localFile, [line(T0 - DAY), line(T0)].join('\n') + '\n')
    await syncUsageHistory(localFile, repo)
    expect(readFileSync(join(repo, 'usage-history', '2026-11-12.jsonl'), 'utf8')).toBe(old)
    expect(tsOf(readFileSync(join(repo, 'usage-history', '2026-11-13.jsonl'), 'utf8'))).toEqual([T0])
  })
})
