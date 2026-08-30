import { useEffect, useState } from 'react'
import { useLatestUsage } from './useLatestUsage'
import { Gauge, ResetInfo, RequestsStat, BurnRateStat, CutoffStat, SpendStat } from './UsageStats'
import { UsageChart } from './UsageChart'
import { UsageSkills } from './UsageSkills'

// Full-page equivalent of the mobile usage dashboard (electron/mobileWeb/
// usage.html) — same data, laid out spaciously instead of stacked for a
// phone screen. Deliberately duplicates the compact sidebar UsagePanel's
// gauges/burn-rate/est.-run-out so this tab works as a standalone dashboard
// even with the sidebar panel closed.
export function UsageGraphPage() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!latest) {
    return (
      <div className="h-full flex items-center justify-center bg-panel">
        <p className="text-sm text-fg-subtle">No usage data yet</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-panel p-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <div className="flex flex-wrap items-start gap-10">
          <div className="flex flex-col items-center gap-3">
            <Gauge pct={latest.sessionPct} label="SESSION" />
            <ResetInfo label="Session resets" resetAt={latest.sessionResetAt} now={now} />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Gauge pct={latest.weeklyPct} label="THIS WEEK" />
            <ResetInfo label="Week resets" resetAt={latest.weeklyResetAt} now={now} />
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Requests</div>
            <RequestsStat label="last 24h" value={latest.requests24h} />
            <RequestsStat label="last 7d" value={latest.requests7d} />
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Burn rate</div>
            <BurnRateStat label="session" ratePerHour={latest.sessionAvgRatePerHour} />
            <BurnRateStat label="week" ratePerHour={latest.weeklyAvgRatePerHour} />
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Est. run out</div>
            <CutoffStat label="session" cutoffAt={latest.sessionCutoffAt} now={now} />
            <CutoffStat label="week" cutoffAt={latest.weeklyCutoffAt} now={now} />
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Est. spend</div>
            <SpendStat label="session" spendUsd={latest.sessionSpendUsd} ratePerHour={latest.sessionSpendRatePerHour} />
          </div>
        </div>

        <div className="border border-border rounded-lg p-4 bg-sidebar">
          <UsageChart latest={latest} metric="session" />
        </div>

        <div className="border border-border rounded-lg p-4 bg-sidebar">
          <UsageChart latest={latest} metric="weekly" />
        </div>

        <div className="border border-border rounded-lg p-4 bg-sidebar">
          <UsageChart latest={latest} metric="sessionSpend" />
        </div>

        <div className="border border-border rounded-lg p-4 bg-sidebar">
          <UsageChart latest={latest} metric="weeklySpend" />
        </div>

        <div className="border border-border rounded-lg p-4 bg-sidebar">
          <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold mb-3">Top skills</div>
          <UsageSkills topSkills={latest.topSkills} />
        </div>
      </div>
    </div>
  )
}
