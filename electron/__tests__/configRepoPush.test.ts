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
    const remoteUsage = git(remote, 'show', 'main:usage-history.jsonl')
    expect(remoteUsage.trim().split('\n').map((l) => JSON.parse(l).ts)).toEqual([1, 2, 3])
  })

  it('commits immediately when a real setting changed, carrying pending usage along', async () => {
    const before = commitCount()
    now = T0 + 2 * MIN
    addUsage(2)
    await push(settings('light'))
    expect(commitCount()).toBe(before + 1)
    expect(git(remote, 'show', 'main:general.json')).toContain('light')
    expect(git(remote, 'show', 'main:usage-history.jsonl')).toContain('"ts":2')
  })
})
