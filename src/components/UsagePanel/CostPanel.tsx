import { useEffect, useState } from 'react'
import { useLatestUsage } from './useLatestUsage'
import { CostSummary } from './UsageStats'

// Estimated, not real billing data — see the sessionSpendUsd/weeklySpendUsd
// comment in electron/usagePoller.ts for why a subscription plan never
// exposes a real $ figure here.
export function CostPanel() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="shrink-0 border-t border-border bg-sidebar px-4 py-3">
      {latest ? (
        <CostSummary
          label="Session"
          spendUsd={latest.sessionSpendUsd}
          ratePerHour={latest.sessionSpendRatePerHour}
          resetAt={latest.sessionResetAt}
          now={now}
        />
      ) : (
        <p className="text-xs text-fg-muted text-center py-4">No usage data yet</p>
      )}
    </div>
  )
}
