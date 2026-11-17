import { formatBurnRate, formatCountdown, formatResetTime, formatSpend, formatSpendRate } from './format'
import { computePace, projectAtReset, type PaceStatus } from './pace'
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '../ui/clampToViewport'

const HATCH = 'repeating-linear-gradient(-45deg, rgb(var(--color-accent) / 0.18) 0 4px, transparent 4px 8px)'

type PacePart = 'used' | 'projected' | 'elapsed' | 'remaining'

const PART_LABEL: Record<PacePart, string> = {
  used: 'Used',
  projected: 'Projected at reset',
  elapsed: 'Time elapsed',
  remaining: 'Remaining',
}

const PART_SWATCH: Record<PacePart, ReactNode> = {
  used: <span className="w-3 h-2 rounded-sm bg-accent" />,
  projected: <span className="w-3 h-2 rounded-sm border border-dashed border-accent/50" style={{ background: HATCH }} />,
  elapsed: <span className="w-0.5 h-3 mx-[5px] bg-fg" />,
  remaining: <span className="w-3 h-2 rounded-sm bg-border" />,
}

// Small pill naming the hovered part of a pace bar and its value. Portaled to
// <body> with fixed positioning so the resizable panel groups around the
// usage panel can't clip it; centred over the hovered part, just above the
// bar, and clamped to the viewport.
function PaceTip({ part, value, x, y }: { part: PacePart; value: number; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos(clampToViewport(x - width / 2, y - height - 8, width, height, 8))
  }, [x, y, part])

  return createPortal(
    <div
      ref={ref}
      data-testid="pace-tip"
      className="fixed z-50 flex items-center gap-2 rounded-full border border-border bg-popover px-2.5 py-1 text-[0.6875rem] font-mono text-fg whitespace-nowrap shadow-lg pointer-events-none"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
    >
      <span className="flex h-3 items-center">{PART_SWATCH[part]}</span>
      <span className="font-semibold">{PART_LABEL[part]}</span>
      <span className="tabular-nums">{Math.round(value)}%</span>
    </div>,
    document.body,
  )
}

export const PACE_CHIP: Record<PaceStatus, string> = {
  under: 'text-emerald-400 bg-emerald-400/15',
  ahead: 'text-accent bg-accent/15',
  'runs-out': 'text-amber-400 bg-amber-400/15',
}

export function paceChipText(status: PaceStatus, projectedPct: number | null, cutoffAt: number | null, now: number): string {
  if (status === 'runs-out') return `Runs out in ${formatCountdown(cutoffAt, now)}`
  const head = status === 'under' ? 'Under pace' : 'Ahead of pace'
  return projectedPct == null ? head : `${head} · ${Math.round(projectedPct)}% at reset`
}

// One usage window as a horizontal bar: solid fill = used so far, hatched
// tail = projected usage at reset at the current burn rate, white tick =
// share of the window's time already elapsed, empty track = headroom left.
// Hovering any of those parts shows a pill naming it. Every text row wraps
// instead of clipping when the pane narrows.
export function PaceBar({
  label, pct, resetAt, ratePerHour, cutoffAt, windowHours, now,
}: {
  label: string
  pct: number | null
  resetAt: number | null
  ratePerHour: number | null
  cutoffAt: number | null
  windowHours: number
  now: number
}) {
  const used = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const { elapsedPct, projectedPct, status } = computePace(pct, resetAt, ratePerHour, cutoffAt, windowHours, now)
  const projEnd = Math.max(used, projectedPct ?? used)
  const projWidth = projEnd - used
  const remaining = 100 - projEnd
  const [hover, setHover] = useState<{ part: PacePart; x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const values: Record<PacePart, number> = {
    used,
    projected: projEnd,
    elapsed: elapsedPct ?? 0,
    remaining,
  }

  const hoverProps = (part: PacePart) => ({
    onMouseEnter: (e: MouseEvent<HTMLDivElement>) => {
      const seg = e.currentTarget.getBoundingClientRect()
      const bar = barRef.current?.getBoundingClientRect() ?? seg
      setHover({ part, x: seg.left + seg.width / 2, y: bar.top })
    },
  })

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">{label}</span>
          <span className="text-xl text-fg font-bold font-mono tabular-nums">{pct == null ? '—' : `${pct}%`}</span>
        </div>
        {status && (
          <span
            data-testid="pace-chip"
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-mono whitespace-nowrap ${PACE_CHIP[status]}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {paceChipText(status, projectedPct, cutoffAt, now)}
          </span>
        )}
      </div>
      <div
        ref={barRef}
        className="relative h-3 rounded-sm bg-border"
        role="img"
        aria-label={`${label} ${pct ?? 0}% used`}
        onMouseLeave={() => setHover(null)}
      >
        {hover && <PaceTip part={hover.part} value={values[hover.part]} x={hover.x} y={hover.y} />}
        {remaining > 0 && (
          <div
            data-testid="pace-remaining"
            className="absolute inset-y-0 right-0"
            style={{ left: `${projEnd}%` }}
            {...hoverProps('remaining')}
          />
        )}
        {projWidth > 0 && (
          <div
            data-testid="pace-projection"
            className="absolute inset-y-0 border border-l-0 border-dashed border-accent/50"
            style={{ left: `${used}%`, width: `${projWidth}%`, background: HATCH }}
            {...hoverProps('projected')}
          />
        )}
        {used > 0 && (
          <div
            data-testid="pace-used"
            className="absolute inset-y-0 left-0 rounded-l-sm bg-accent"
            style={{ width: `${used}%`, transition: 'width 0.6s ease' }}
            {...hoverProps('used')}
          />
        )}
        {elapsedPct != null && (
          // 12px-wide hit area around the 2px line so it is easy to hover.
          <div
            data-testid="pace-now"
            className="absolute -top-1 -bottom-1 z-10 w-3 -ml-1.5 flex justify-center"
            style={{ left: `${elapsedPct}%` }}
            {...hoverProps('elapsed')}
          >
            <div className="w-0.5 h-full bg-fg" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 mt-1.5 text-xs text-fg-muted">
        <span>
          Resets in <span className="text-accent font-mono tabular-nums">{formatCountdown(resetAt, now)}</span>
          {' · '}{formatResetTime(resetAt)}
        </span>
        <span className="font-mono tabular-nums">{formatBurnRate(ratePerHour)}</span>
      </div>
    </div>
  )
}

// Estimated spend for one window, laid out like a PaceBar header (no bar,
// since there is no dollar limit to fill): figure + "Estimate" tag, a chip
// with projected spend at reset, and a reset/rate footer. Rows wrap instead
// of clipping. Shared by the chat sidebar's CostPanel and the Usage Graph page.
export function CostSummary({
  label, spendUsd, ratePerHour, resetAt, now,
}: {
  label: string
  spendUsd: number | null
  ratePerHour: number | null
  resetAt: number | null
  now: number
}) {
  const projected = projectAtReset(spendUsd, ratePerHour, resetAt, now)

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[0.625rem] text-fg-muted uppercase tracking-wider font-semibold">{label}</span>
          <span className="text-xl text-fg font-bold font-mono tabular-nums">{formatSpend(spendUsd)}</span>
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
          Resets in <span className="text-accent font-mono tabular-nums">{formatCountdown(resetAt, now)}</span>
          {' · '}{formatResetTime(resetAt)}
        </span>
        <span className="font-mono tabular-nums">{formatSpendRate(ratePerHour)}</span>
      </div>
    </div>
  )
}
