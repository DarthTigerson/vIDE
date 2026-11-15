import { useEffect, useState } from 'react'
import { useLatestUsage } from './useLatestUsage'
import { PaceBar } from './UsageStats'
import { SESSION_WINDOW_HOURS, WEEKLY_WINDOW_HOURS } from './pace'

export function UsagePanel() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="shrink-0 border-t border-border bg-sidebar px-4 py-3">
      {latest ? (
        <div className="flex flex-col gap-4">
          <PaceBar
            label="Session"
            pct={latest.sessionPct}
            resetAt={latest.sessionResetAt}
            ratePerHour={latest.sessionAvgRatePerHour}
            cutoffAt={latest.sessionCutoffAt}
            windowHours={SESSION_WINDOW_HOURS}
            now={now}
          />
          <PaceBar
            label="Week"
            pct={latest.weeklyPct}
            resetAt={latest.weeklyResetAt}
            ratePerHour={latest.weeklyAvgRatePerHour}
            cutoffAt={latest.weeklyCutoffAt}
            windowHours={WEEKLY_WINDOW_HOURS}
            now={now}
          />
        </div>
      ) : (
        <p className="text-xs text-fg-muted text-center py-4">No usage data yet</p>
      )}
    </div>
  )
}
