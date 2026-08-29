import { create } from 'zustand'
import type { LatestUsage } from '@/types/api'

export interface UsageAlert {
  scope: 'session' | 'week'
  cutoffAt: number
}

interface UsageAlertState {
  alert: UsageAlert | null
  handleUpdate: (latest: LatestUsage | null) => void
}

// A non-null cutoff means the poller projects that window to hit 100%
// before it resets — i.e. already "critical", no separate threshold to
// tune. Whichever window is projected to run out sooner wins if both are
// at risk.
function pickAlert(latest: LatestUsage): UsageAlert | null {
  const candidates: UsageAlert[] = []
  if (latest.sessionCutoffAt != null) candidates.push({ scope: 'session', cutoffAt: latest.sessionCutoffAt })
  if (latest.weeklyCutoffAt != null) candidates.push({ scope: 'week', cutoffAt: latest.weeklyCutoffAt })
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => a.cutoffAt - b.cutoffAt)[0]
}

export const useUsageAlertStore = create<UsageAlertState>((set) => ({
  alert: null,

  // Fed by every usage:update push, regardless of *which* refcounted source
  // (desktop panel, mobile pairing, or passive monitoring — see
  // UsageManager) is keeping the one shared poller alive. Mirrors
  // useUpdateStore: once a critical cutoff is seen it stays put — including
  // after the poller stops because the panel that triggered it closed —
  // until a later poll reports both windows back on track. A null payload
  // (no snapshot yet) leaves whatever alert is already showing untouched.
  handleUpdate: (latest) => {
    if (!latest) return
    set({ alert: pickAlert(latest) })
  },
}))
