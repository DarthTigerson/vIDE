// Same 0-100 x 0-100 viewBox trick as the mobile usage chart
// (electron/mobileWeb/usage.js): x is "percent of the way through the
// window" by timestamp, y is "100 minus pct used" so the SVG can be
// stretched to fill whatever box it's given with preserveAspectRatio="none".
export function xFor(ts: number, from: number, to: number): number {
  if (to === from) return 0
  return ((ts - from) / (to - from)) * 100
}

export function yFor(pct: number): number {
  return 100 - pct
}

interface HasTimestamp {
  ts: number
}

// How far apart two consecutive snapshots have to be, relative to the
// series' own typical spacing, before that gap counts as "real" missing
// data (vIDE/machine off) rather than just normal poll jitter.
//
// Self-calibrates off the *mean* delta (total span / (n - 1)) rather than
// the smallest one. An earlier version used the smallest delta and broke
// badly in production: real poll cadence is jittery (bursts, slow polls,
// a single unusually-fast repoll), so the smallest observed delta in a
// series is itself often an outlier — and a threshold built on an outlier
// is one bad sample away from collapsing to near-zero, at which point
// *every* normal gap looks "real" and the line fragments into dozens of
// disconnected pieces (verified against production usage-history.jsonl:
// min-based flagged 35 gaps in one hour of continuous polling; mean-based
// correctly flagged 0, and still correctly found the genuine 9-15h
// overnight gaps at longer ranges). The mean is far harder to blow out the
// same way — one big real gap pulls it up somewhat, but a lone small delta
// barely moves it, since it's averaged over every delta in the series
// rather than defined by whichever single one happens to be smallest.
const GAP_MULTIPLIER = 6

function meanDelta(timestamps: number[]): number {
  if (timestamps.length < 2) return Infinity
  return (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
}

// Exported so callers (the hover crosshair) can use the same notion of
// "real gap" to avoid snapping to a snapshot that's actually on the other
// side of a break in the data.
export function gapThresholdMs<T extends HasTimestamp>(snapshots: T[]): number {
  return meanDelta(snapshots.map((s) => s.ts)) * GAP_MULTIPLIER
}

// pctOf is an accessor rather than a fixed field name so the same chart math
// drives both the session and weekly usage charts (UsageChart's `metric`
// prop) without duplicating this module. Returns one points-string per
// contiguous run of snapshots — split wherever a real gap (see
// gapThresholdMs) falls between two consecutive points — so the chart can
// render each run as its own <polyline> instead of smearing a straight line
// across dead time.
export function buildLineSegments<T extends HasTimestamp>(snapshots: T[], from: number, to: number, pctOf: (s: T) => number): string[] {
  if (snapshots.length < 2) return []
  const threshold = gapThresholdMs(snapshots)

  const segments: string[] = []
  let current: string[] = []
  for (let i = 0; i < snapshots.length; i++) {
    if (i > 0 && snapshots[i].ts - snapshots[i - 1].ts > threshold) {
      if (current.length >= 2) segments.push(current.join(' '))
      current = []
    }
    current.push(`${xFor(snapshots[i].ts, from, to).toFixed(2)},${yFor(pctOf(snapshots[i])).toFixed(2)}`)
  }
  if (current.length >= 2) segments.push(current.join(' '))
  return segments
}

// Estimates what probably happened inside each real gap (see
// gapThresholdMs), using the reset timestamp already recorded on every
// snapshot rather than guessing from the pct values:
//
//   - If the reset deadline recorded on the last pre-gap snapshot had
//     already passed by the time the next real poll came in, a reset
//     provably happened somewhere in the gap (the recorded resetAt is
//     exactly when) — predict a drop to 0% right at that instant, then a
//     climb back up to the real post-gap value.
//   - Otherwise nothing reset — the most likely explanation is vIDE (or the
//     machine) was simply closed and reopened before the window rolled
//     over, so predict a flat hold at the last known value up to the real
//     post-gap value (a step, not a guessed gradual climb — we have no
//     basis for the shape of that climb).
//
// Deliberately checks only the *one* deadline recorded before the gap
// against the next poll's timestamp, rather than comparing the pre- and
// post-gap resetAt values for equality. Verified against production
// usage-history.jsonl: the CLI rounds its reset countdown in its own
// display, so the recorded resetAt drifts by about a minute between
// consecutive real polls ~20% of the time with no reset happening — an
// equality check on two independently-jittery values misread that jitter
// as "the window changed" constantly. A single deadline compared against a
// precise poll timestamp has no such noise.
//
// Returns one "x1,y1 x2,y2" points-string per predicted sub-segment (two
// per reset gap, one per flat-hold gap), meant to be rendered dashed and
// separately from the real (solid) segments buildLineSegments produces.
export function buildGapPredictions<T extends HasTimestamp>(
  snapshots: T[],
  from: number,
  to: number,
  pctOf: (s: T) => number,
  resetAtOf: (s: T) => number | null
): string[] {
  if (snapshots.length < 2) return []
  const threshold = gapThresholdMs(snapshots)
  const point = (ts: number, pct: number) => `${xFor(ts, from, to).toFixed(2)},${yFor(pct).toFixed(2)}`

  const predictions: string[] = []
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]
    const next = snapshots[i]
    if (next.ts - prev.ts <= threshold) continue

    const resetAt = resetAtOf(prev)
    if (resetAt != null && resetAt <= next.ts) {
      const clampedResetAt = Math.max(resetAt, prev.ts)
      predictions.push(`${point(prev.ts, pctOf(prev))} ${point(clampedResetAt, 0)}`)
      predictions.push(`${point(clampedResetAt, 0)} ${point(next.ts, pctOf(next))}`)
    } else {
      predictions.push(`${point(prev.ts, pctOf(prev))} ${point(next.ts, pctOf(prev))}`)
    }
  }
  return predictions
}

export interface ProjectionLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

// The dashed "at this rate, you'll hit 100% here" segment. Only drawn when
// the cutoff actually falls inside the visible window — off-screen numbers
// aren't a useful graph annotation, the numeric estimate covers that case.
export function buildProjectionLine<T extends HasTimestamp>(
  lastSnapshot: T | undefined,
  pctOf: (s: T) => number,
  cutoffAt: number | null,
  from: number,
  to: number
): ProjectionLine | null {
  if (!lastSnapshot || cutoffAt == null) return null
  if (cutoffAt < from || cutoffAt > to) return null
  return {
    x1: xFor(lastSnapshot.ts, from, to),
    y1: yFor(pctOf(lastSnapshot)),
    x2: xFor(cutoffAt, from, to),
    y2: yFor(100),
  }
}

export const USAGE_RANGES = ['1h', '24h', '7d', '30d'] as const
export type UsageRange = (typeof USAGE_RANGES)[number]

export const USAGE_RANGE_MS: Record<UsageRange, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
}

// For the chart crosshair — which real snapshot is closest to wherever the
// pointer landed. Earlier snapshot wins an exact tie.
export function nearestSnapshotByTime<T extends { ts: number }>(snapshots: T[], ts: number): T | undefined {
  let best: T | undefined
  let bestDiff = Infinity
  for (const s of snapshots) {
    const diff = Math.abs(s.ts - ts)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return best
}
