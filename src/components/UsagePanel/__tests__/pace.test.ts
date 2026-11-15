import { describe, it, expect } from 'vitest'
import { computePace, SESSION_WINDOW_HOURS, WEEKLY_WINDOW_HOURS } from '../pace'

const H = 3_600_000
const NOW = 1_000_000_000_000

describe('computePace', () => {
  it('returns nulls without a percent or reset time', () => {
    expect(computePace(null, NOW + H, 1, null, 5, NOW)).toEqual({ elapsedPct: null, projectedPct: null, status: null })
    expect(computePace(40, null, 1, null, 5, NOW)).toEqual({ elapsedPct: null, projectedPct: null, status: null })
  })

  it('computes elapsed share of the window and projection at reset', () => {
    // 1.2h left of a 5h window → 76% elapsed; 50 + 13.17 * 1.2 ≈ 65.8
    const p = computePace(50, NOW + 1.2 * H, 13.17, null, SESSION_WINDOW_HOURS, NOW)
    expect(p.elapsedPct).toBeCloseTo(76)
    expect(p.projectedPct).toBeCloseTo(65.804)
    expect(p.status).toBe('under')
  })

  it('is ahead of pace when usage exceeds elapsed time', () => {
    const p = computePace(60, NOW + 100 * H, 0.3, null, WEEKLY_WINDOW_HOURS, NOW)
    expect(p.status).toBe('ahead')
  })

  it('reports runs-out whenever a cutoff is predicted', () => {
    const p = computePace(80, NOW + 2 * H, 20, NOW + H, SESSION_WINDOW_HOURS, NOW)
    expect(p.status).toBe('runs-out')
    expect(p.projectedPct).toBe(100)
  })

  it('leaves projection null without a burn rate', () => {
    expect(computePace(10, NOW + H, null, null, 5, NOW).projectedPct).toBeNull()
  })

  it('clamps elapsed when the reset time has passed or exceeds the window', () => {
    expect(computePace(10, NOW - H, 1, null, 5, NOW).elapsedPct).toBe(100)
    expect(computePace(10, NOW + 10 * H, 1, null, 5, NOW).elapsedPct).toBe(0)
  })
})
