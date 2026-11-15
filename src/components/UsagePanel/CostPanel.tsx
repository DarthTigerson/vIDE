import { useEffect, useState } from 'react'
import { useLatestUsage } from './useLatestUsage'
import { formatCountdown, formatResetTime, formatSpend, formatSpendRate } from './format'
import { projectAtReset } from './pace'

// Estimated, not real billing data — see the sessionSpendUsd/weeklySpendUsd
// comment in electron/usagePoller.ts for why a subscription plan never
// exposes a real $ figure here. Laid out like a PaceBar header (no bar, since
// there is no dollar limit to fill), with rows that wrap instead of clipping.
export function CostPanel() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const projected = latest
    ? projectAtReset(latest.sessionSpendUsd, latest.sessionSpendRatePerHour, latest.sessionResetAt, now)
    : null

  return (
    <div className="shrink-0 border-t border-border bg-sidebar px-4 py-3">
      {latest ? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Session</span>
              <span className="text-xl text-fg font-bold font-mono tabular-nums">{formatSpend(latest.sessionSpendUsd)}</span>
              <span className="rounded-full border border-border px-1.5 py-px text-[0.5625rem] font-mono uppercase tracking-wider text-fg-muted">
                Estimate
              </span>
            </div>
            {projected != null && (
              <span
                data-testid="cost-projection"
                className="rounded-full border border-accent/50 px-2 py-0.5 text-[0.625rem] font-mono uppercase tracking-wider text-accent whitespace-nowrap"
              >
                ≈{formatSpend(projected)} at reset
              </span>
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-fg-muted">
            <span>
              Resets in <span className="text-accent font-mono tabular-nums">{formatCountdown(latest.sessionResetAt, now)}</span>
              {' · '}{formatResetTime(latest.sessionResetAt)}
            </span>
            <span className="font-mono tabular-nums">{formatSpendRate(latest.sessionSpendRatePerHour)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-fg-muted text-center py-4">No usage data yet</p>
      )}
    </div>
  )
}
