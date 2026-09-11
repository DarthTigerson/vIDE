import { create } from 'zustand'
import type { LatestUsage } from '@/types/api'

export interface UsageAlert {
  scope: 'session' | 'week'
  cutoffAt: number
  resetAt: number | null
}

interface UsageAlertState {
  // Both windows can be at risk simultaneously — this holds every alert
  // currently at risk (not just the more urgent one), sorted soonest-first.
  alerts: UsageAlert[]
  handleUpdate: (latest: LatestUsage | null) => void
}

// A non-null cutoff means the poller projects that window to hit 100%
// before it resets — i.e. already "critical", no separate threshold to
// tune.
function pickAlerts(latest: LatestUsage): UsageAlert[] {
  const candidates: UsageAlert[] = []
  if (latest.sessionCutoffAt != null) {
    candidates.push({ scope: 'session', cutoffAt: latest.sessionCutoffAt, resetAt: latest.sessionResetAt })
  }
  if (latest.weeklyCutoffAt != null) {
    candidates.push({ scope: 'week', cutoffAt: latest.weeklyCutoffAt, resetAt: latest.weeklyResetAt })
  }
  return candidates.sort((a, b) => a.cutoffAt - b.cutoffAt)
}

export const useUsageAlertStore = create<UsageAlertState>((set) => ({
  alerts: [],

  // Fed by every usage:update push, regardless of *which* refcounted source
  // (desktop panel, mobile pairing, or passive monitoring — see
  // UsageManager) is keeping the one shared poller alive. Mirrors
  // useUpdateStore: once a critical cutoff is seen it stays put — including
  // after the poller stops because the panel that triggered it closed —
  // until a later poll reports both windows back on track. A null payload
  // (no snapshot yet) leaves whatever alerts are already showing untouched.
  handleUpdate: (latest) => {
    if (!latest) return
    set({ alerts: pickAlerts(latest) })
  },
}))
