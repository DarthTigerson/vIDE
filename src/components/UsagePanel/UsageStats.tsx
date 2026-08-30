import { formatBurnRate, formatCountdown, formatResetTime, formatSpend, formatSpendRate } from './format'

const RADIUS = 38
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function Gauge({ pct, label }: { pct: number | null; label: string }) {
  const clamped = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const offset = CIRCUMFERENCE * (1 - clamped / 100)

  return (
    <svg viewBox="0 0 100 100" width={92} height={92}>
      <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke="rgb(var(--color-accent))"
        strokeWidth="9"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50" y="47" textAnchor="middle" fill="var(--color-fg)" fontSize="20" fontWeight="700">
        {pct == null ? '—' : `${pct}%`}
      </text>
      <text x="50" y="63" textAnchor="middle" fill="var(--color-fg-muted)" fontSize="8.5" letterSpacing="0.5">
        {label}
      </text>
    </svg>
  )
}

export function ResetInfo({ label, resetAt, now }: { label: string; resetAt: number | null; now: number }) {
  return (
    <div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="text-sm text-fg font-medium">{formatResetTime(resetAt)}</div>
      <div className="text-xs text-accent font-mono">{formatCountdown(resetAt, now)}</div>
    </div>
  )
}

export function BurnRateStat({ label, ratePerHour }: { label: string; ratePerHour: number | null }) {
  return (
    <div>
      <div className="text-sm text-fg font-mono">{formatBurnRate(ratePerHour)}</div>
      <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider">{label}</div>
    </div>
  )
}

export function RequestsStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl text-fg font-bold font-mono">{value.toLocaleString()}</div>
      <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider">{label}</div>
    </div>
  )
}

export function SpendStat({ label, spendUsd, ratePerHour }: { label: string; spendUsd: number; ratePerHour: number | null }) {
  return (
    <div>
      <div className="text-2xl text-fg font-bold font-mono">{formatSpend(spendUsd)}</div>
      <div className="text-xs text-accent font-mono">{formatSpendRate(ratePerHour)}</div>
      <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider">{label}</div>
    </div>
  )
}

export function CutoffStat({ label, cutoffAt, now }: { label: string; cutoffAt: number | null; now: number }) {
  return (
    <div>
      {cutoffAt == null ? (
        <div className="text-sm text-fg-muted font-mono">on track</div>
      ) : (
        <>
          <div className="text-sm text-amber-400 font-medium">{formatResetTime(cutoffAt)}</div>
          <div className="text-xs text-amber-400/80 font-mono">{formatCountdown(cutoffAt, now)}</div>
        </>
      )}
      <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider">{label}</div>
    </div>
  )
}
