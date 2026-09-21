// usagePoller appends a snapshot every poll, so every periodic config-sync push
// has a non-empty usage-history.jsonl diff. Without a guard that becomes a git
// commit (and push) every couple of minutes. There's no urgency for usage data,
// so a push whose only change is usage history waits for this interval.
export const USAGE_ONLY_COMMIT_INTERVAL_MS = 10 * 60 * 1000

const USAGE_HISTORY_FILE = 'usage-history.jsonl'

// `ownLastCommitMs` is this process's last commit time (0 before the first),
// deliberately not the repo HEAD's age: with two machines running, HEAD age
// would let whichever machine ticks first win every window and starve the other.
export function shouldSkipUsageOnlyCommit(
  changedPaths: string[],
  ownLastCommitMs: number,
  nowMs: number,
): boolean {
  if (changedPaths.length === 0) return false
  if (!changedPaths.every((p) => p === USAGE_HISTORY_FILE)) return false
  return nowMs - ownLastCommitMs < USAGE_ONLY_COMMIT_INTERVAL_MS
}
