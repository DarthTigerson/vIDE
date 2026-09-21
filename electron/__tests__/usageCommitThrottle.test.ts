import { describe, it, expect } from 'vitest'
import {
  shouldSkipUsageOnlyCommit,
  USAGE_ONLY_COMMIT_INTERVAL_MS,
} from '../usageCommitThrottle'

const MIN = 60_000
const NOW = 1_800_000_000_000

describe('shouldSkipUsageOnlyCommit', () => {
  it('uses a 10 minute interval', () => {
    expect(USAGE_ONLY_COMMIT_INTERVAL_MS).toBe(10 * MIN)
  })

  it('skips when only usage history changed and this machine committed recently', () => {
    expect(shouldSkipUsageOnlyCommit(['usage-history.jsonl'], NOW - 9 * MIN, NOW)).toBe(true)
  })

  it('commits once this machine last committed a full interval ago', () => {
    expect(
      shouldSkipUsageOnlyCommit(['usage-history.jsonl'], NOW - USAGE_ONLY_COMMIT_INTERVAL_MS, NOW),
    ).toBe(false)
  })

  it('commits on the first push of a launch, when nothing has been committed yet', () => {
    expect(shouldSkipUsageOnlyCommit(['usage-history.jsonl'], 0, NOW)).toBe(false)
  })

  it('never skips when any other file changed alongside usage history', () => {
    expect(
      shouldSkipUsageOnlyCommit(['usage-history.jsonl', 'todos-data.json'], NOW - MIN, NOW),
    ).toBe(false)
  })

  it('never skips when only non-usage files changed', () => {
    expect(shouldSkipUsageOnlyCommit(['general.json'], NOW - MIN, NOW)).toBe(false)
  })

  it('does not treat a same-named file in a subfolder as the usage file', () => {
    expect(shouldSkipUsageOnlyCommit(['notes/usage-history.jsonl'], NOW - MIN, NOW)).toBe(false)
  })

  it('does not skip when nothing changed at all', () => {
    expect(shouldSkipUsageOnlyCommit([], NOW - MIN, NOW)).toBe(false)
  })
})
