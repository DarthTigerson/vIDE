import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => state.userData },
  BrowserWindow: { getAllWindows: () => [] },
}))

const MIN = 60_000
const T0 = 1_800_000_000_000
// Larger than any commit time, so pushSettings never thinks another machine
// pushed since our last sync and never tries to apply remote settings.
const NEVER_STALE = Number.MAX_SAFE_INTEGER

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

describe('pushSettings usage-only commit throttle', () => {
  let root: string
  let remote: string
  let usageFile: string
  let pushSettings: typeof import('../configRepo').pushSettings
  let now = T0

  const settings = (theme: string) => ({ general: { 'vide:theme': theme } })
  const commitCount = () => parseInt(git(remote, 'rev-list', '--count', 'main').trim(), 10)
  const addUsage = (ts: number) => appendFileSync(usageFile, JSON.stringify({ ts }) + '\n')
  const push = (data: Record<string, Record<string, string>>) => pushSettings(data, NEVER_STALE)

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'vide-sync-'))
    remote = join(root, 'remote.git')
    const userData = join(root, 'userData')
    mkdirSync(userData)
    usageFile = join(userData, 'usage-history.jsonl')

    // A remote that already has a commit, so the clone gets an origin/HEAD
    // just like a real config repo that's been used before.
    git(root, 'init', '--bare', '-b', 'main', remote)
    const seed = join(root, 'seed')
    git(root, 'clone', remote, seed)
    git(seed, 'config', 'user.email', 'seed@local')
    git(seed, 'config', 'user.name', 'seed')
    writeFileSync(join(seed, 'README.md'), 'seed')
    git(seed, 'add', '-A')
    git(seed, 'commit', '-m', 'seed')
    git(seed, 'push', 'origin', 'HEAD:main')
    git(root, 'clone', remote, join(userData, 'config-repo'))

    state.userData = userData
    now = T0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.resetModules() // fresh module = a freshly launched app (no commit yet)
    ;({ pushSettings } = await import('../configRepo'))

    addUsage(1)
    await push(settings('dark')) // first push of a launch always commits
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('skips a usage-only push shortly after this machine last committed', async () => {
    const before = commitCount()
    now = T0 + 2 * MIN
    addUsage(2)
    await push(settings('dark'))
    expect(commitCount()).toBe(before)
  })

  it('commits usage-only changes once 10 minutes have passed, including the skipped ones', async () => {
    const before = commitCount()
    now = T0 + 2 * MIN
    addUsage(2)
    await push(settings('dark'))
    now = T0 + 10 * MIN
    addUsage(3)
    await push(settings('dark'))
    expect(commitCount()).toBe(before + 1)
    const remoteUsage = git(remote, 'show', 'main:usage-history/1970-01-01.jsonl')
    expect(remoteUsage.trim().split('\n').map((l) => JSON.parse(l).ts)).toEqual([1, 2, 3])
  })

  it('commits immediately when a real setting changed, carrying pending usage along', async () => {
    const before = commitCount()
    now = T0 + 2 * MIN
    addUsage(2)
    await push(settings('light'))
    expect(commitCount()).toBe(before + 1)
    expect(git(remote, 'show', 'main:general.json')).toContain('light')
    expect(git(remote, 'show', 'main:usage-history/1970-01-01.jsonl')).toContain('"ts":2')
  })
})

describe('pushSettings history compaction', () => {
  let root: string
  let remote: string
  let userData: string
  let pushSettings: typeof import('../configRepo').pushSettings

  const commitCount = () => parseInt(git(remote, 'rev-list', '--count', 'main').trim(), 10)

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'vide-sync-'))
    remote = join(root, 'remote.git')
    userData = join(root, 'userData')
    mkdirSync(userData)

    // A remote written by an older build: the whole usage history as one
    // file, a new copy of it in every commit.
    git(root, 'init', '--bare', '-b', 'main', remote)
    const old = join(root, 'old')
    git(root, 'clone', remote, old)
    git(old, 'config', 'user.email', 'old@local')
    git(old, 'config', 'user.name', 'old')
    for (let i = 1; i <= 5; i++) {
      appendFileSync(join(old, 'usage-history.jsonl'), JSON.stringify({ ts: T0 + i * MIN }) + '\n')
      git(old, 'add', '-A')
      git(old, 'commit', '-m', `old ${i}`)
    }
    git(old, 'push', 'origin', 'HEAD:main')
    git(root, 'clone', remote, join(userData, 'config-repo'))

    state.userData = userData
    vi.resetModules()
    ;({ pushSettings } = await import('../configRepo'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('squashes the remote to one commit and moves usage history into daily shards', async () => {
    writeFileSync(join(userData, 'usage-history.jsonl'), JSON.stringify({ ts: T0 + 6 * MIN }) + '\n')
    await pushSettings({ general: { 'vide:theme': 'dark' } }, NEVER_STALE)

    expect(commitCount()).toBe(1)
    const files = git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n')
    expect(files).not.toContain('usage-history.jsonl')
    const day = new Date(T0).toISOString().slice(0, 10)
    const shard = git(remote, 'show', `main:usage-history/${day}.jsonl`)
    expect(shard.trim().split('\n').map((l) => JSON.parse(l).ts)).toEqual([1, 2, 3, 4, 5, 6].map((i) => T0 + i * MIN))
  })

  it('goes back to normal commits once compacted', async () => {
    await pushSettings({ general: { 'vide:theme': 'dark' } }, NEVER_STALE)
    await pushSettings({ general: { 'vide:theme': 'light' } }, NEVER_STALE)
    expect(commitCount()).toBe(2)
  })

  it('keeps a newer push from another machine when compacting', async () => {
    // Another machine already moved past the old history before this one compacts.
    const other = join(root, 'other')
    git(root, 'clone', remote, other)
    git(other, 'config', 'user.email', 'other@local')
    git(other, 'config', 'user.name', 'other')
    writeFileSync(join(other, 'jira.json'), '{"k":"v"}')
    git(other, 'add', '-A')
    git(other, 'commit', '-m', 'other machine')
    git(other, 'push', 'origin', 'HEAD:main')

    await pushSettings({ general: { 'vide:theme': 'dark' } }, NEVER_STALE)
    expect(git(remote, 'show', 'main:jira.json')).toContain('"k"')
    expect(commitCount()).toBe(1)
  })
})
