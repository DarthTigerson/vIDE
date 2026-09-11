import { describe, it, expect, beforeEach } from 'vitest'
import { useUsageAlertStore } from '../usageAlertStore'
import type { LatestUsage } from '@/types/api'

function makeLatest(overrides: Partial<LatestUsage> = {}): LatestUsage {
  return {
    ts: 1000,
    sessionPct: 10,
    weeklyPct: 10,
    requests24h: 0,
    requests7d: 0,
    topSkills: [],
    sessionResetAt: null,
    weeklyResetAt: null,
    sessionAvgRatePerHour: null,
    weeklyAvgRatePerHour: null,
    sessionCutoffAt: null,
    weeklyCutoffAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  useUsageAlertStore.setState({ alerts: [] })
})

describe('usageAlertStore', () => {
  it('stays empty when neither window is projected to run out', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest())
    expect(useUsageAlertStore.getState().alerts).toEqual([])
  })

  it('sets a session alert when only sessionCutoffAt is set', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000 }))
    expect(useUsageAlertStore.getState().alerts).toEqual([{ scope: 'session', cutoffAt: 5000, resetAt: null }])
  })

  it('sets a week alert when only weeklyCutoffAt is set', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ weeklyCutoffAt: 9000 }))
    expect(useUsageAlertStore.getState().alerts).toEqual([{ scope: 'week', cutoffAt: 9000, resetAt: null }])
  })

  it('includes both when both windows are at risk, most urgent first', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 9000, weeklyCutoffAt: 5000 }))
    expect(useUsageAlertStore.getState().alerts).toEqual([
      { scope: 'week', cutoffAt: 5000, resetAt: null },
      { scope: 'session', cutoffAt: 9000, resetAt: null },
    ])
  })

  it('clears previous alerts once a later update reports both windows back on track', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000 }))
    expect(useUsageAlertStore.getState().alerts).not.toEqual([])

    useUsageAlertStore.getState().handleUpdate(makeLatest())
    expect(useUsageAlertStore.getState().alerts).toEqual([])
  })

  it('leaves existing alerts untouched when fed a null payload (e.g. the poller has no snapshot yet)', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000 }))
    useUsageAlertStore.getState().handleUpdate(null)
    expect(useUsageAlertStore.getState().alerts).toEqual([{ scope: 'session', cutoffAt: 5000, resetAt: null }])
  })

  it('carries the session reset time through', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000, sessionResetAt: 8000, weeklyResetAt: 9000 }))
    expect(useUsageAlertStore.getState().alerts).toEqual([{ scope: 'session', cutoffAt: 5000, resetAt: 8000 }])
  })

  it('carries the weekly reset time through', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ weeklyCutoffAt: 9000, sessionResetAt: 8000, weeklyResetAt: 12000 }))
    expect(useUsageAlertStore.getState().alerts).toEqual([{ scope: 'week', cutoffAt: 9000, resetAt: 12000 }])
  })
})
