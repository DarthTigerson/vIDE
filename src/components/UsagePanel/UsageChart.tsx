import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LatestUsage, UsageSnapshot } from '@/types/api'
import { formatSpend } from './format'
import {
  buildLineSegments,
  buildGapPredictions,
  buildProjectionLine,
  gapThresholdMs,
  nearestSnapshotByTime,
  xFor,
  yFor,
  USAGE_RANGES,
  USAGE_RANGE_MS,
  type UsageRange,
} from './sparkline'

export type UsageMetric = 'session' | 'weekly' | 'sessionSpend' | 'weeklySpend'

// Session and weekly resets happen on very different timescales (hours vs.
// days), so each metric gets its own default range and its own "how far
// into the future is a projected cutoff still worth drawing" window —
// a weekly cutoff routinely projects days out, where a session one is
// usually hours.
//
// The two spend metrics share this same plotting pipeline even though a
// dollar total has no natural 0-100 scale the way a percent does: isPercent
// tells the component below whether valueOf is already on that scale
// (session/weekly) or needs normalizing against the visible data's own max
// before it's handed to sparkline.ts's fixed 0-100 math (the spend
// metrics) — cutoffOf returns null for spend since a subscription plan
// has no dollar cap for a "runs out at" projection to project toward.
const METRIC: Record<
  UsageMetric,
  {
    title: string
    label: string
    valueOf: (s: UsageSnapshot) => number
    resetAtOf: (s: UsageSnapshot) => number | null
    cutoffOf: (l: LatestUsage) => number | null
    defaultRange: UsageRange
    futureWindowMs: number
    formatValue: (v: number) => string
    isPercent: boolean
  }
> = {
  session: {
    title: 'Session usage',
    label: 'session',
    valueOf: (s) => s.sessionPct,
    resetAtOf: (s) => s.sessionResetAt,
    cutoffOf: (l) => l.sessionCutoffAt,
    defaultRange: '24h',
    futureWindowMs: 6 * 60 * 60 * 1000,
    formatValue: (v) => `${Math.round(v)}%`,
    isPercent: true,
  },
  weekly: {
    title: 'Weekly usage',
    label: 'week',
    valueOf: (s) => s.weeklyPct,
    resetAtOf: (s) => s.weeklyResetAt,
    cutoffOf: (l) => l.weeklyCutoffAt,
    defaultRange: '7d',
    futureWindowMs: 2 * 24 * 60 * 60 * 1000,
    formatValue: (v) => `${Math.round(v)}%`,
    isPercent: true,
  },
  sessionSpend: {
    title: 'Session cost',
    label: 'session',
    valueOf: (s) => s.sessionSpendUsd,
    resetAtOf: (s) => s.sessionResetAt,
    cutoffOf: () => null,
    defaultRange: '24h',
    futureWindowMs: 0,
    formatValue: formatSpend,
    isPercent: false,
  },
  weeklySpend: {
    title: 'Weekly cost',
    label: 'week',
    valueOf: (s) => s.weeklySpendUsd,
    resetAtOf: (s) => s.weeklyResetAt,
    cutoffOf: () => null,
    defaultRange: '7d',
    futureWindowMs: 0,
    formatValue: formatSpend,
    isPercent: false,
  },
}

const GRID_PCTS = [100, 75, 50, 25, 0]

// Session-window series use the accent; week-window series a blue that reads
// on both the dark and light themes, so the two lines stay apart when a chart
// draws both (the Usage Graph page's "All" view).
const WEEK_COLOR = '#60a5fa'
const SERIES_COLOR: Record<UsageMetric, string> = {
  session: 'rgb(var(--color-accent))',
  sessionSpend: 'rgb(var(--color-accent))',
  weekly: WEEK_COLOR,
  weeklySpend: WEEK_COLOR,
}

// Persisted per metric set (not shared) since session and weekly already have
// different natural defaults (24h vs. 7d) — a user zooming the session
// chart to 1h shouldn't also collapse the weekly chart down to 1h. A single
// metric keeps its original key so existing stored ranges still apply.
function rangeStorageKey(storageId: string): string {
  return `vide.usageChart.range.${storageId}`
}

function loadStoredRange(storageId: string): UsageRange | null {
  const stored = localStorage.getItem(rangeStorageKey(storageId))
  return (USAGE_RANGES as readonly string[]).includes(stored ?? '') ? (stored as UsageRange) : null
}

// Joined button group (one bordered track, buttons inside it) used for the
// range picker and the Usage Graph page's metric/window switches, so related
// options read as one control.
export function Segmented<T extends string>({
  label, value, options, onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-sm border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={[
            'px-2 py-0.5 text-xs rounded-xs transition-colors',
            o.value === value ? 'bg-white/10 text-fg' : 'text-fg-muted hover:text-fg hover:bg-white/5',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function fmtAxisTime(ts: number, range: UsageRange): string {
  const d = new Date(ts)
  if (range === '1h' || range === '24h') {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface Hover {
  x: number
  y: number
  snapshot: UsageSnapshot
}

// Draws one or more metrics on a shared time axis. All metrics in one chart
// must share a scale kind (all percent, or all spend) — spend series are
// normalized together against the largest visible dollar value so they stay
// comparable. `title` overrides the first metric's own title; `controls`
// renders beside the range buttons (the graph page's Usage/Cost and
// All/Session/Week switches). `rangeId` pins the remembered range to one
// storage slot regardless of which metrics are drawn, so switching what the
// chart shows never changes the range the user picked; without it the range
// is remembered per metric set.
export function UsageChart({
  latest, metrics, title, controls, rangeId, defaultRange,
}: {
  latest: LatestUsage
  metrics: UsageMetric[]
  title?: string
  controls?: ReactNode
  rangeId?: string
  defaultRange?: UsageRange
}) {
  const configs = metrics.map((m) => ({ metric: m, ...METRIC[m] }))
  const primary = configs[0]
  const isPercent = primary.isPercent
  const storageId = rangeId ?? metrics.join('+')
  const [range, setRangeState] = useState<UsageRange>(
    () => loadStoredRange(storageId) ?? defaultRange ?? primary.defaultRange,
  )

  function setRange(next: UsageRange) {
    setRangeState(next)
    localStorage.setItem(rangeStorageKey(storageId), next)
  }
  const [snapshots, setSnapshots] = useState<UsageSnapshot[]>([])
  const [hover, setHover] = useState<Hover | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const to = Date.now()
    const from = to - USAGE_RANGE_MS[range]
    window.api.usageGetRange(from, to, 200).then((data) => {
      if (!cancelled) setSnapshots(data)
    })
    return () => {
      cancelled = true
    }
  }, [range, latest.ts])

  const now = Date.now()
  const from = now - USAGE_RANGE_MS[range]
  const cutoffs = configs.map((c) => {
    const cutoffAt = c.cutoffOf(latest)
    return cutoffAt != null && cutoffAt <= now + c.futureWindowMs ? cutoffAt : null
  })
  const to = Math.max(now, ...cutoffs.map((c) => c ?? now))

  // sparkline.ts's plotting math (yFor, buildLineSegments, ...) is fixed to
  // a 0-100 scale — for a percent metric valueOf is already on that scale,
  // for spend metrics it's normalized here against the visible data's own
  // max (across every drawn series) first. Actual dollar values are recovered
  // for grid/tooltip labels via formatValue(valueOf(...)), never from this
  // pct space.
  const plotMax = isPercent
    ? 100
    : Math.max(1e-9, ...configs.flatMap((c) => snapshots.map(c.valueOf)))

  const series = configs.map((c, i) => {
    const pctOf = (s: UsageSnapshot) => (c.valueOf(s) / plotMax) * 100
    return {
      ...c,
      color: SERIES_COLOR[c.metric],
      pctOf,
      lineSegments: buildLineSegments(snapshots, from, to, pctOf),
      gapPredictions: buildGapPredictions(snapshots, from, to, pctOf, c.resetAtOf),
      projection: buildProjectionLine(snapshots[snapshots.length - 1], pctOf, cutoffs[i], from, to),
    }
  })
  const hasLines = series.some((s) => s.lineSegments.length > 0)

  function handlePointer(clientX: number) {
    const el = plotRef.current
    if (!el || snapshots.length < 2) return
    const rect = el.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const ts = from + pct * (to - from)

    const first = snapshots[0].ts
    const last = snapshots[snapshots.length - 1].ts
    if (ts < first || ts > last) {
      setHover(null)
      return
    }

    const snapshot = nearestSnapshotByTime(snapshots, ts)
    // Don't snap to a point on the other side of a real data gap — the
    // pointer is over dead time, so there's nothing meaningful to show.
    if (!snapshot || Math.abs(snapshot.ts - ts) > gapThresholdMs(snapshots)) {
      setHover(null)
      return
    }
    const topPct = Math.max(...series.map((s) => s.pctOf(snapshot)))
    setHover({ x: xFor(snapshot.ts, from, to), y: yFor(topPct), snapshot })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">{title ?? primary.title}</div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <Segmented
            label="Range"
            value={range}
            options={USAGE_RANGES.map((r) => ({ value: r, label: r.toUpperCase() }))}
            onChange={setRange}
          />
        </div>
      </div>

      {hasLines ? (
        <>
          <div className="flex gap-2 h-72">
            <div className="flex flex-col justify-between text-xs text-fg-subtle text-right leading-none">
              {GRID_PCTS.map((p) => (
                <span key={p}>{primary.formatValue((plotMax * p) / 100)}</span>
              ))}
            </div>
            <div
              ref={plotRef}
              data-testid="chart-plot"
              className="relative flex-1 touch-none"
              onPointerDown={(e) => handlePointer(e.clientX)}
              onPointerMove={(e) => {
                if (e.buttons || e.pointerType === 'touch') handlePointer(e.clientX)
              }}
              onPointerLeave={() => setHover(null)}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                <g stroke="var(--color-border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke">
                  {GRID_PCTS.map((p) => (
                    <line key={p} x1="0" y1={100 - p} x2="100" y2={100 - p} strokeDasharray="1.5 2" />
                  ))}
                </g>
                {series.map((s) => (
                  <g key={s.metric} data-series={s.metric}>
                    {s.gapPredictions.map((points, i) => (
                      <polyline
                        key={i}
                        data-testid="gap-prediction-line"
                        points={points}
                        fill="none"
                        stroke={s.color}
                        strokeOpacity="0.45"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {s.lineSegments.map((points, i) => (
                      <polyline
                        key={i}
                        points={points}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {s.projection && (
                      <line
                        data-testid="projection-line"
                        x1={s.projection.x1}
                        y1={s.projection.y1}
                        x2={s.projection.x2}
                        y2={s.projection.y2}
                        stroke={s.color}
                        strokeOpacity="0.8"
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </g>
                ))}
                {hover && (
                  <line
                    x1={hover.x}
                    y1="0"
                    x2={hover.x}
                    y2="100"
                    stroke="var(--color-fg-muted)"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              {hover && (
                <div
                  data-testid="chart-tooltip"
                  className="absolute -translate-y-full bg-popover border border-border rounded-sm px-2 py-1 text-xs shadow-lg pointer-events-none whitespace-nowrap"
                  style={{
                    left: `${hover.x}%`,
                    top: `${hover.y}%`,
                    transform: hover.x < 20 ? 'translateY(-110%)' : hover.x > 80 ? 'translateY(-110%) translateX(-100%)' : 'translateY(-110%) translateX(-50%)',
                  }}
                >
                  <div className="text-fg-muted">{fmtAxisTime(hover.snapshot.ts, range)}</div>
                  {series.map((s) => (
                    <div key={s.metric} className="flex items-center gap-1.5 text-fg font-semibold">
                      {series.length > 1 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />}
                      {s.formatValue(s.valueOf(hover.snapshot))} {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between text-xs text-fg-subtle pl-8">
            <span>{fmtAxisTime(from, range)}</span>
            <span>{fmtAxisTime(to, range)}</span>
          </div>
          {series.length > 1 && (
            <div data-testid="chart-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
              {series.map((s) => (
                <span key={s.metric} className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 rounded-full" style={{ background: s.color }} />
                  {s.label === 'week' ? 'Week' : 'Session'}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 border-t-2 border-dashed border-fg-subtle" />
                Projected
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="h-72 flex items-center justify-center text-xs text-fg-muted">Not enough history yet for this range</div>
      )}
    </div>
  )
}
