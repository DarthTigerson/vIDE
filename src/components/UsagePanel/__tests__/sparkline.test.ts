import { describe, it, expect } from 'vitest'
import {
  xFor,
  yFor,
  buildLineSegments,
  buildGapPredictions,
  gapThresholdMs,
  buildProjectionLine,
  nearestSnapshotByTime,
  USAGE_RANGE_MS,
} from '../sparkline'

describe('xFor', () => {
  it('maps the start of the window to 0 and the end to 100', () => {
    expect(xFor(1000, 1000, 2000)).toBe(0)
    expect(xFor(2000, 1000, 2000)).toBe(100)
  })

  it('maps the midpoint of the window to 50', () => {
    expect(xFor(1500, 1000, 2000)).toBe(50)
  })
})

describe('yFor', () => {
  it('inverts pct so 0% sits at the bottom (100) and 100% at the top (0)', () => {
    expect(yFor(0)).toBe(100)
    expect(yFor(100)).toBe(0)
    expect(yFor(50)).toBe(50)
  })
})

const sessionPctOf = (s: { sessionPct: number }) => s.sessionPct
const weeklyPctOf = (s: { weeklyPct: number }) => s.weeklyPct

describe('buildLineSegments', () => {
  it('returns no segments with fewer than two snapshots', () => {
    expect(buildLineSegments([], 0, 1000, sessionPctOf)).toEqual([])
    expect(buildLineSegments([{ ts: 0, sessionPct: 10 }], 0, 1000, sessionPctOf)).toEqual([])
  })

  it('builds a single "x,y x,y" polyline segment from evenly spaced snapshots', () => {
    const snaps = [
      { ts: 0, sessionPct: 0 },
      { ts: 1000, sessionPct: 100 },
    ]
    expect(buildLineSegments(snaps, 0, 1000, sessionPctOf)).toEqual(['0.00,100.00 100.00,0.00'])
  })

  it('works with any pct accessor, e.g. weeklyPct', () => {
    const snaps = [
      { ts: 0, weeklyPct: 20 },
      { ts: 1000, weeklyPct: 40 },
    ]
    expect(buildLineSegments(snaps, 0, 1000, weeklyPctOf)).toEqual(['0.00,80.00 100.00,60.00'])
  })

  it('breaks into separate segments across a real gap (e.g. vIDE was closed overnight)', () => {
    // Two dense runs (~1min cadence, 9min each) either side of a 6h gap —
    // proportions taken from real polling data so the mean isn't dominated
    // by either the dense cadence or the one outlier gap.
    const before = Array.from({ length: 10 }, (_, i) => ({ ts: i * 60_000, sessionPct: 10 + i }))
    const gapStart = before[before.length - 1].ts + 6 * 3_600_000
    const after = Array.from({ length: 10 }, (_, i) => ({ ts: gapStart + i * 60_000, sessionPct: 40 + i }))
    const snaps = [...before, ...after]
    const to = snaps[snaps.length - 1].ts

    const segments = buildLineSegments(snaps, 0, to, sessionPctOf)
    expect(segments).toHaveLength(2)
    expect(segments[0].split(' ')).toHaveLength(10)
    expect(segments[1].split(' ')).toHaveLength(10)
  })

  it('does not fragment a dense run over one unusually fast poll (regression: a single small delta must not collapse the threshold)', () => {
    // Same cadence as buildLineSegments' first "real gap" case, but with one
    // outlier-fast repoll mixed in (10s instead of ~60s) — this is the exact
    // shape that broke a naive min-delta-based threshold in production.
    const snaps = [
      { ts: 0, sessionPct: 10 },
      { ts: 60_000, sessionPct: 12 },
      { ts: 70_000, sessionPct: 12 }, // outlier: only 10s after the previous point
      { ts: 130_000, sessionPct: 13 },
      { ts: 190_000, sessionPct: 14 },
      { ts: 250_000, sessionPct: 15 },
    ]
    const to = snaps[snaps.length - 1].ts
    const segments = buildLineSegments(snaps, 0, to, sessionPctOf)
    expect(segments).toHaveLength(1)
    expect(segments[0].split(' ')).toHaveLength(6)
  })
})

describe('buildGapPredictions', () => {
  const resetAtOf = (s: { sessionResetAt: number | null }) => s.sessionResetAt

  // Same 10+10 dense-cluster-around-a-6h-gap shape as buildLineSegments'
  // gap test, plus a sessionResetAt field on every snapshot.
  function buildGapFixture(resetBefore: number | null, resetAfter: number | null) {
    const before = Array.from({ length: 10 }, (_, i) => ({ ts: i * 60_000, sessionPct: 10 + i, sessionResetAt: resetBefore }))
    const gapStart = before[before.length - 1].ts + 6 * 3_600_000
    const after = Array.from({ length: 10 }, (_, i) => ({ ts: gapStart + i * 60_000, sessionPct: 40 + i, sessionResetAt: resetAfter }))
    return { before, after, snaps: [...before, ...after] }
  }

  it('returns no predictions with fewer than two snapshots', () => {
    expect(buildGapPredictions([], 0, 1000, sessionPctOf, resetAtOf)).toEqual([])
    expect(buildGapPredictions([{ ts: 0, sessionPct: 10, sessionResetAt: null }], 0, 1000, sessionPctOf, resetAtOf)).toEqual([])
  })

  it('predicts nothing when there is no real gap', () => {
    const snaps = [
      { ts: 0, sessionPct: 10, sessionResetAt: 999_999 },
      { ts: 60_000, sessionPct: 12, sessionResetAt: 999_999 },
    ]
    expect(buildGapPredictions(snaps, 0, 60_000, sessionPctOf, resetAtOf)).toEqual([])
  })

  it('predicts a drop to 0% at the recorded reset time, then a climb back up, when the reset timestamp changed across the gap', () => {
    // The reset window recorded on the last pre-gap snapshot falls inside
    // the gap itself — exactly what "a reset happened while we weren't
    // watching" looks like in the recorded data.
    const resetAt = 540_000 + 3 * 3_600_000 // 3h into the 6h gap
    const { before, after, snaps } = buildGapFixture(resetAt, resetAt + 5 * 24 * 3_600_000)
    const to = snaps[snaps.length - 1].ts
    const point = (ts: number, pct: number) => `${xFor(ts, 0, to).toFixed(2)},${yFor(pct).toFixed(2)}`

    const lastBefore = before[before.length - 1]
    const firstAfter = after[0]
    const predictions = buildGapPredictions(snaps, 0, to, sessionPctOf, resetAtOf)

    expect(predictions).toEqual([
      `${point(lastBefore.ts, lastBefore.sessionPct)} ${point(resetAt, 0)}`,
      `${point(resetAt, 0)} ${point(firstAfter.ts, firstAfter.sessionPct)}`,
    ])
  })

  it('predicts a flat hold at the last known value when the reset timestamp is unchanged across the gap', () => {
    // Same reset window before and after — nothing reset, so the most
    // likely explanation is vIDE (or the machine) was simply closed and
    // reopened before the window rolled over.
    const { before, after, snaps } = buildGapFixture(999_999_999, 999_999_999)
    const to = snaps[snaps.length - 1].ts
    const point = (ts: number, pct: number) => `${xFor(ts, 0, to).toFixed(2)},${yFor(pct).toFixed(2)}`

    const lastBefore = before[before.length - 1]
    const firstAfter = after[0]
    const predictions = buildGapPredictions(snaps, 0, to, sessionPctOf, resetAtOf)

    expect(predictions).toEqual([`${point(lastBefore.ts, lastBefore.sessionPct)} ${point(firstAfter.ts, lastBefore.sessionPct)}`])
  })

  it('does not predict a reset from harmless minute-level jitter in the recorded reset timestamp (regression: the CLI rounds its reset countdown, so resetAt can drift by ~1min between polls with no reset happening)', () => {
    // Confirmed against production usage-history.jsonl: weeklyResetAt
    // flips by exactly 60s between consecutive real polls ~20% of the time
    // while weeklyPct stays flat — pure text-rounding noise from the CLI,
    // not a reset. Both values here are still far beyond the gap (the
    // deadline hasn't passed), just 1 minute apart from each other.
    const farFuture = 22_140_000 + 100_000_000
    const { snaps } = buildGapFixture(farFuture, farFuture - 60_000)
    const to = snaps[snaps.length - 1].ts
    expect(buildGapPredictions(snaps, 0, to, sessionPctOf, resetAtOf)).toHaveLength(1)
  })

  it('treats a null reset timestamp on either side as "unchanged" (flat hold), not a reset', () => {
    const { snaps } = buildGapFixture(null, null)
    const to = snaps[snaps.length - 1].ts
    const predictions = buildGapPredictions(snaps, 0, to, sessionPctOf, resetAtOf)
    expect(predictions).toHaveLength(1)
  })
})

describe('gapThresholdMs', () => {
  it('is infinite (no threshold) with fewer than two snapshots', () => {
    expect(gapThresholdMs([])).toBe(Infinity)
    expect(gapThresholdMs([{ ts: 0 }])).toBe(Infinity)
  })

  it('scales with the mean spacing between snapshots', () => {
    const dense = [{ ts: 0 }, { ts: 60_000 }, { ts: 120_000 }]
    const sparse = [{ ts: 0 }, { ts: 3_600_000 }, { ts: 7_200_000 }]
    expect(gapThresholdMs(sparse)).toBeGreaterThan(gapThresholdMs(dense))
  })
})

describe('buildProjectionLine', () => {
  const lastSnapshot = { ts: 1000, sessionPct: 50 }

  it('returns null when there is no cutoff', () => {
    expect(buildProjectionLine(lastSnapshot, sessionPctOf, null, 0, 2000)).toBeNull()
  })

  it('returns null when there is no last snapshot', () => {
    expect(buildProjectionLine<{ ts: number; sessionPct: number }>(undefined, sessionPctOf, 1500, 0, 2000)).toBeNull()
  })

  it('returns null when the cutoff falls outside the visible window', () => {
    expect(buildProjectionLine(lastSnapshot, sessionPctOf, 5000, 0, 2000)).toBeNull()
    expect(buildProjectionLine(lastSnapshot, sessionPctOf, -100, 0, 2000)).toBeNull()
  })

  it('builds a segment from the last real point to the cutoff at 100%', () => {
    const line = buildProjectionLine(lastSnapshot, sessionPctOf, 1500, 0, 2000)
    expect(line).toEqual({ x1: 50, y1: 50, x2: 75, y2: 0 })
  })
})

describe('USAGE_RANGE_MS', () => {
  it('covers 1h/24h/7d/30d in milliseconds', () => {
    expect(USAGE_RANGE_MS['1h']).toBe(3_600_000)
    expect(USAGE_RANGE_MS['24h']).toBe(86_400_000)
    expect(USAGE_RANGE_MS['7d']).toBe(604_800_000)
    expect(USAGE_RANGE_MS['30d']).toBe(2_592_000_000)
  })
})

describe('nearestSnapshotByTime', () => {
  const snaps = [
    { ts: 0, sessionPct: 10 },
    { ts: 1000, sessionPct: 20 },
    { ts: 3000, sessionPct: 30 },
  ]

  it('returns undefined for an empty series', () => {
    expect(nearestSnapshotByTime([], 500)).toBeUndefined()
  })

  it('returns the snapshot with the closest timestamp', () => {
    expect(nearestSnapshotByTime(snaps, 900)).toEqual({ ts: 1000, sessionPct: 20 })
    expect(nearestSnapshotByTime(snaps, 100)).toEqual({ ts: 0, sessionPct: 10 })
  })

  it('breaks ties by preferring the earlier snapshot', () => {
    expect(nearestSnapshotByTime(snaps, 500)).toEqual({ ts: 0, sessionPct: 10 })
  })
})
