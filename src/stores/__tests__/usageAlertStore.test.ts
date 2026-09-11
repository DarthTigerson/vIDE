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
  useUsageAlertStore.setState({ alert: null })
})

describe('usageAlertStore', () => {
  it('stays null when neither window is projected to run out', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest())
    expect(useUsageAlertStore.getState().alert).toBeNull()
  })

  it('sets a session alert when only sessionCutoffAt is set', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000 }))
    expect(useUsageAlertStore.getState().alert).toEqual({ scope: 'session', cutoffAt: 5000, resetAt: null })
  })

  it('sets a week alert when only weeklyCutoffAt is set', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ weeklyCutoffAt: 9000 }))
    expect(useUsageAlertStore.getState().alert).toEqual({ scope: 'week', cutoffAt: 9000, resetAt: null })
  })

  it('picks whichever window is projected to run out sooner when both are at risk', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 9000, weeklyCutoffAt: 5000 }))
    expect(useUsageAlertStore.getState().alert).toEqual({ scope: 'week', cutoffAt: 5000, resetAt: null })
  })

  it('clears a previous alert once a later update reports both windows back on track', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000 }))
    expect(useUsageAlertStore.getState().alert).not.toBeNull()

    useUsageAlertStore.getState().handleUpdate(makeLatest())
    expect(useUsageAlertStore.getState().alert).toBeNull()
  })

  it('leaves an existing alert untouched when fed a null payload (e.g. the poller has no snapshot yet)', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000 }))
    useUsageAlertStore.getState().handleUpdate(null)
    expect(useUsageAlertStore.getState().alert).toEqual({ scope: 'session', cutoffAt: 5000, resetAt: null })
  })

  it('carries the session reset time through when a session alert is picked', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ sessionCutoffAt: 5000, sessionResetAt: 8000, weeklyResetAt: 9000 }))
    expect(useUsageAlertStore.getState().alert).toEqual({ scope: 'session', cutoffAt: 5000, resetAt: 8000 })
  })

  it('carries the weekly reset time through when a week alert is picked', () => {
    useUsageAlertStore.getState().handleUpdate(makeLatest({ weeklyCutoffAt: 9000, sessionResetAt: 8000, weeklyResetAt: 12000 }))
    expect(useUsageAlertStore.getState().alert).toEqual({ scope: 'week', cutoffAt: 9000, resetAt: 12000 })
  })
})
