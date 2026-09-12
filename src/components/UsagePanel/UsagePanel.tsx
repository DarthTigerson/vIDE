import { useEffect, useState } from 'react'
import { useLatestUsage } from './useLatestUsage'
import { Gauge, ResetInfo, BurnRateStat, CutoffStat } from './UsageStats'

export function UsagePanel() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="shrink-0 border-t border-border bg-sidebar px-4 py-3 overflow-x-hidden">
      {latest ? (
        <div className="flex items-start gap-10">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <Gauge pct={latest.sessionPct} label="SESSION" />
            <ResetInfo label="Session resets" resetAt={latest.sessionResetAt} now={now} />
          </div>
          <div className="flex flex-col items-center gap-3 shrink-0">
            <Gauge pct={latest.weeklyPct} label="THIS WEEK" />
            <ResetInfo label="Week resets" resetAt={latest.weeklyResetAt} now={now} />
          </div>
          <div className="flex flex-col gap-3 pt-1 shrink-0">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Burn rate</div>
            <BurnRateStat label="session" ratePerHour={latest.sessionAvgRatePerHour} />
            <BurnRateStat label="week" ratePerHour={latest.weeklyAvgRatePerHour} />
          </div>
          <div className="flex flex-col gap-3 pt-1 shrink-0">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Est. run out</div>
            <CutoffStat label="session" cutoffAt={latest.sessionCutoffAt} now={now} />
            <CutoffStat label="week" cutoffAt={latest.weeklyCutoffAt} now={now} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-fg-muted text-center py-4">No usage data yet</p>
      )}
    </div>
  )
}
