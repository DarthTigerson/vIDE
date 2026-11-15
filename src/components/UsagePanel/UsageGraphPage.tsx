import { useEffect, useState } from 'react'
import { useLatestUsage } from './useLatestUsage'
import { CostSummary, PaceBar } from './UsageStats'
import { UsageChart, type UsageMetric } from './UsageChart'
import { UsageSkills } from './UsageSkills'
import { SESSION_WINDOW_HOURS, WEEKLY_WINDOW_HOURS } from './pace'

type ChartKind = 'usage' | 'cost'
type ChartWindow = 'all' | 'session' | 'week'

const CHART_VIEW_KEY = 'vide.usageGraph.chartView'

const CHART_METRICS: Record<ChartKind, Record<ChartWindow, UsageMetric[]>> = {
  usage: { all: ['session', 'weekly'], session: ['session'], week: ['weekly'] },
  cost: { all: ['sessionSpend', 'weeklySpend'], session: ['sessionSpend'], week: ['weeklySpend'] },
}

const CHART_TITLE: Record<ChartKind, Record<ChartWindow, string>> = {
  usage: { all: 'Session & week usage', session: 'Session usage', week: 'Weekly usage' },
  cost: { all: 'Session & week cost', session: 'Session cost', week: 'Weekly cost' },
}

function loadChartView(): { kind: ChartKind; window: ChartWindow } {
  try {
    const v = JSON.parse(localStorage.getItem(CHART_VIEW_KEY) ?? '')
    if (v.kind in CHART_METRICS && v.window in CHART_METRICS.usage) return v
  } catch { /* fall through to the default */ }
  return { kind: 'usage', window: 'all' }
}

function Segmented<T extends string>({
  label, value, options, onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={[
            'px-2 py-1 text-xs rounded border transition-colors',
            o.value === value
              ? 'border-fg-muted bg-white/5 text-fg'
              : 'border-border text-fg-muted hover:text-fg hover:bg-white/5 hover:border-fg-muted',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const card = 'border border-border rounded-lg p-4 bg-sidebar min-w-0'

// Full-page equivalent of the mobile usage dashboard (electron/mobileWeb/
// usage.html) — same data, laid out spaciously. Uses the same PaceBar and
// CostSummary as the sidebar UsagePanel and chat CostPanel so the three read
// as one system, and deliberately duplicates them so this tab works as a
// standalone dashboard with both panels closed. One chart card replaces the
// old four: Usage/Cost × All/Session/Week, where "All" draws both windows.
export function UsageGraphPage() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())
  const [view, setView] = useState(loadChartView)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  function updateView(next: Partial<typeof view>) {
    const merged = { ...view, ...next }
    setView(merged)
    localStorage.setItem(CHART_VIEW_KEY, JSON.stringify(merged))
  }

  if (!latest) {
    return (
      <div className="h-full flex items-center justify-center bg-panel">
        <p className="text-sm text-fg-subtle">No usage data yet</p>
      </div>
    )
  }

  const metrics = CHART_METRICS[view.kind][view.window]

  return (
    <div className="h-full overflow-auto bg-panel p-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
          <div className={card}>
            <PaceBar
              label="Session"
              pct={latest.sessionPct}
              resetAt={latest.sessionResetAt}
              ratePerHour={latest.sessionAvgRatePerHour}
              cutoffAt={latest.sessionCutoffAt}
              windowHours={SESSION_WINDOW_HOURS}
              now={now}
            />
          </div>
          <div className={card}>
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
          <div className={card}>
            <CostSummary
              label="Session cost"
              spendUsd={latest.sessionSpendUsd}
              ratePerHour={latest.sessionSpendRatePerHour}
              resetAt={latest.sessionResetAt}
              now={now}
            />
          </div>
          <div className={card}>
            <CostSummary
              label="Week cost"
              spendUsd={latest.weeklySpendUsd}
              ratePerHour={latest.weeklySpendRatePerHour}
              resetAt={latest.weeklyResetAt}
              now={now}
            />
          </div>
        </div>

        <div className={`${card} flex flex-wrap items-baseline gap-x-7 gap-y-2 py-3`}>
          <span className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">Requests</span>
          <span className="flex items-baseline gap-2">
            <span className="text-base text-fg font-bold font-mono tabular-nums">{latest.requests24h.toLocaleString()}</span>
            <span className="text-xs text-fg-muted">last 24h</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-base text-fg font-bold font-mono tabular-nums">{latest.requests7d.toLocaleString()}</span>
            <span className="text-xs text-fg-muted">last 7d</span>
          </span>
        </div>

        <div className={card}>
          <UsageChart
            key={metrics.join('+')}
            latest={latest}
            metrics={metrics}
            title={CHART_TITLE[view.kind][view.window]}
            controls={
              <>
                <Segmented
                  label="Metric"
                  value={view.kind}
                  options={[{ value: 'usage', label: 'Usage' }, { value: 'cost', label: 'Cost' }]}
                  onChange={(kind) => updateView({ kind })}
                />
                <Segmented
                  label="Window"
                  value={view.window}
                  options={[{ value: 'all', label: 'All' }, { value: 'session', label: 'Session' }, { value: 'week', label: 'Week' }]}
                  onChange={(window) => updateView({ window })}
                />
              </>
            }
          />
        </div>

        <div className={card}>
          <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold mb-3">Top skills</div>
          <UsageSkills topSkills={latest.topSkills} />
        </div>
      </div>
    </div>
  )
}
