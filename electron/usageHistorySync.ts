import { readFile, writeFile, readdir, mkdir, rm } from 'fs/promises'
import { join } from 'path'

// The config repo used to hold the whole usage history as one file. It gains
// a line a minute and is never trimmed, so every sync commit stored a fresh
// copy of a multi-MB file; after a few months the repo held thousands of
// versions of a 20+ MB blob and `git fetch`/repack on it needed several GB of
// RAM, enough to take down an 8 GB machine at launch. One file per UTC day
// means a commit only ever rewrites today's small shard, and past days never
// change again. The local userData file stays a single file (UsagePoller).
export const LEGACY_USAGE_FILE = 'usage-history.jsonl'
export const USAGE_SHARD_DIR = 'usage-history'

// Recent shards are pulled even when this machine already has that day,
// because another machine may still be appending to it.
const RECENT_SHARD_DAYS = 2

export function isUsagePath(path: string): boolean {
  return path === LEGACY_USAGE_FILE || path.startsWith(`${USAGE_SHARD_DIR}/`)
}

export function shardDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

// Merge two usage-history JSONL line arrays: union by snapshot timestamp,
// sorted ascending. Duplicate ts values keep the first occurrence.
export function mergeUsageHistory(a: string[], b: string[]): string[] {
  const byTs = new Map<number, string>()
  for (const line of [...a, ...b]) {
    try {
      const snap = JSON.parse(line) as { ts: number }
      if (!byTs.has(snap.ts)) byTs.set(snap.ts, line)
    } catch { /* skip corrupt lines */ }
  }
  return [...byTs.entries()].sort(([x], [y]) => x - y).map(([, line]) => line)
}

// Lines must already be valid (i.e. come out of mergeUsageHistory).
export function groupByDay(lines: string[]): Map<string, string[]> {
  const byDay = new Map<string, string[]>()
  for (const line of lines) {
    const day = shardDay((JSON.parse(line) as { ts: number }).ts)
    const list = byDay.get(day)
    if (list) list.push(line)
    else byDay.set(day, [line])
  }
  return byDay
}

// Which remote shards a pull should read: days this machine has no data for
// at all, plus the last couple of days. Older days it already has are left
// alone so a pull doesn't spawn one `git show` per day of history.
export function shardsToPull(remoteShardFiles: string[], localDays: Set<string>, nowMs: number): string[] {
  const recentFrom = shardDay(nowMs - RECENT_SHARD_DAYS * 24 * 60 * 60 * 1000)
  return remoteShardFiles.filter((file) => {
    const day = file.replace(/\.jsonl$/, '')
    return day >= recentFrom || !localDays.has(day)
  })
}

export function toJsonl(lines: string[]): string {
  return lines.join('\n') + (lines.length ? '\n' : '')
}

async function readLines(path: string): Promise<string[]> {
  try {
    return (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export async function readLocalUsageDays(localFile: string): Promise<Set<string>> {
  const days = new Set<string>()
  for (const line of mergeUsageHistory(await readLines(localFile), [])) {
    days.add(shardDay((JSON.parse(line) as { ts: number }).ts))
  }
  return days
}

export async function mergeIntoLocalUsage(localFile: string, remoteLines: string[]): Promise<void> {
  const merged = mergeUsageHistory(await readLines(localFile), remoteLines)
  await writeFile(localFile, toJsonl(merged), 'utf8')
}

// Two-way merge between the local history file and the repo working tree:
// both end up holding the union. Only shards whose content changed are
// rewritten, and a legacy single file (from an older build) is folded in and
// removed.
export async function syncUsageHistory(localFile: string, repoDir: string): Promise<void> {
  const shardDir = join(repoDir, USAGE_SHARD_DIR)
  const legacyFile = join(repoDir, LEGACY_USAGE_FILE)
  const shardFiles = (await readdir(shardDir).catch(() => [] as string[])).filter((f) => f.endsWith('.jsonl'))

  const existing = new Map<string, string>()
  const repoLines: string[] = await readLines(legacyFile)
  for (const file of shardFiles) {
    const content = await readFile(join(shardDir, file), 'utf8')
    existing.set(file, content)
    repoLines.push(...content.trim().split('\n').filter(Boolean))
  }

  const merged = mergeUsageHistory(await readLines(localFile), repoLines)
  await writeFile(localFile, toJsonl(merged), 'utf8')
  if (merged.length === 0) return

  await mkdir(shardDir, { recursive: true })
  for (const [day, lines] of groupByDay(merged)) {
    const file = `${day}.jsonl`
    const content = toJsonl(lines)
    if (existing.get(file) !== content) await writeFile(join(shardDir, file), content, 'utf8')
  }
  await rm(legacyFile, { force: true })
}
