// Window lengths mirror SESSION_WINDOW_HOURS / WEEKLY_WINDOW_HOURS in
// electron/usagePoller.ts — the poller only sends reset timestamps, so the
// renderer needs the window length to know how far through it we are.
export const SESSION_WINDOW_HOURS = 5
export const WEEKLY_WINDOW_HOURS = 7 * 24

export type PaceStatus = 'under' | 'ahead' | 'runs-out'

export interface Pace {
  /** Percent of the window's time already elapsed (0–100), or null without a reset time. */
  elapsedPct: number | null
  /** Usage percent projected at reset at the current burn rate (clamped to 100), or null. */
  projectedPct: number | null
  status: PaceStatus | null
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function computePace(
  pct: number | null,
  resetAt: number | null,
  ratePerHour: number | null,
  cutoffAt: number | null,
  windowHours: number,
  now: number,
): Pace {
  if (pct == null || resetAt == null) return { elapsedPct: null, projectedPct: null, status: null }

  const hoursLeft = Math.max(0, (resetAt - now) / 3_600_000)
  const elapsedPct = clamp((1 - hoursLeft / windowHours) * 100)
  const projectedPct = ratePerHour == null ? null : clamp(pct + ratePerHour * hoursLeft)

  let status: PaceStatus
  if (cutoffAt != null) status = 'runs-out'
  else if (pct <= elapsedPct) status = 'under'
  else status = 'ahead'

  return { elapsedPct, projectedPct, status }
}

/** Value at reset if the current hourly rate holds; null without a rate or reset time. */
export function projectAtReset(value: number | null, ratePerHour: number | null, resetAt: number | null, now: number): number | null {
  if (value == null || ratePerHour == null || resetAt == null) return null
  return value + ratePerHour * Math.max(0, (resetAt - now) / 3_600_000)
}
