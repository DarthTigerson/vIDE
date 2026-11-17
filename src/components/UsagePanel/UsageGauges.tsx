import { useId, type ReactNode } from 'react'
import { formatBurnRate, formatCountdown, formatResetTime } from './format'
import { computePace, type Pace } from './pace'
import { PACE_CHIP, paceChipText } from './UsageStats'

// The usage panel's Gauges view (the default; Bars is the other, picked from
// the panel's right-click menu): session as a speedometer, week as a fuel
// gauge, and a fuel-pump warning light between them that turns red and
// pulses once either window hits its limit. Each dial shows the same three
// readings as a PaceBar: solid arc + needle = used so far, hatched arc =
// projected at reset, triangle on the rim = share of the window's time
// already elapsed.
//
// Both dials and the light are drawn in one SVG so the light keeps its place
// (just above where the arcs start) at any panel width.

export interface GaugeWindow {
  label: string
  pct: number | null
  resetAt: number | null
  ratePerHour: number | null
  cutoffAt: number | null
  windowHours: number
}

// One dial's canvas: 200 wide, y from -14 to 166, hub at (100, 100).
const DIAL_W = 200
const GAP = 34
const VIEW_W = DIAL_W * 2 + GAP
const CX = 100
const CY = 100
const R = 84
const SWEEP = 240
const BAND = R - 3
const REDLINE_FROM = 90

const angle = (pct: number) => -SWEEP / 2 + (SWEEP * pct) / 100

function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)]
}

function arcPath(cx: number, cy: number, r: number, fromPct: number, toPct: number): string | null {
  const a0 = angle(fromPct)
  const a1 = angle(toPct)
  if (a1 - a0 < 0.01) return null
  const [x0, y0] = point(cx, cy, r, a0)
  const [x1, y1] = point(cx, cy, r, a1)
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n))
const isOut = (w: GaugeWindow) => w.pct != null && w.pct >= 100

const ACCENT = 'rgb(var(--color-accent))'
const RED = 'rgb(239 68 68)'

function Dial({ win, pace, x, kind, hatchId }: {
  win: GaugeWindow
  pace: Pace
  x: number
  kind: 'speedo' | 'fuel'
  hatchId: string
}) {
  const cx = x + CX
  const used = win.pct == null ? 0 : clampPct(win.pct)
  const projected = Math.max(used, pace.projectedPct ?? used)

  const ticks: ReactNode[] = []
  if (kind === 'speedo') {
    for (let p = 0; p <= 100; p += 5) {
      const major = p % 20 === 0
      const [x0, y0] = point(cx, CY, R - (major ? 11 : 6), angle(p))
      const [x1, y1] = point(cx, CY, R - 1, angle(p))
      ticks.push(<line key={`t${p}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--color-fg-subtle)" strokeWidth={major ? 2 : 1} strokeLinecap="round" />)
      if (major) {
        const [tx, ty] = point(cx, CY, R - 22, angle(p))
        ticks.push(<text key={`n${p}`} x={tx} y={ty + 3.5} textAnchor="middle" fontSize="10" fill="var(--color-fg-muted)">{p}</text>)
      }
    }
  } else {
    const marks: [string, number][] = [['E', 0], ['¼', 25], ['½', 50], ['¾', 75], ['F', 100]]
    for (const [label, p] of marks) {
      const [x0, y0] = point(cx, CY, R - 12, angle(p))
      const [x1, y1] = point(cx, CY, R - 1, angle(p))
      const [tx, ty] = point(cx, CY, R - 24, angle(p))
      const ends = label === 'E' || label === 'F'
      ticks.push(<line key={`t${p}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--color-fg-subtle)" strokeWidth={2} strokeLinecap="round" />)
      ticks.push(<text key={`n${p}`} x={tx} y={ty + 4} textAnchor="middle" fontSize={ends ? 12 : 11} fontWeight={ends ? 700 : 400} fill="var(--color-fg-muted)">{label}</text>)
    }
    for (let p = 12.5; p < 100; p += 25) {
      const [x0, y0] = point(cx, CY, R - 6, angle(p))
      const [x1, y1] = point(cx, CY, R - 1, angle(p))
      ticks.push(<line key={`m${p}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--color-fg-subtle)" strokeWidth={1} />)
    }
  }

  const [nx, ny] = point(cx, CY, R - 14, angle(used))
  const elapsedMarker = pace.elapsedPct == null ? null : (() => {
    const a = angle(pace.elapsedPct)
    const pts = [point(cx, CY, R + 2, a), point(cx, CY, R + 10, a - 3.2), point(cx, CY, R + 10, a + 3.2)]
    return pts.map(([px, py]) => `${px},${py}`).join(' ')
  })()

  const usedArc = arcPath(cx, CY, BAND, 0, used)
  const projectedArc = arcPath(cx, CY, BAND, used, projected)

  return (
    <g data-testid={`gauge-${win.label.toLowerCase()}`}>
      <path d={arcPath(cx, CY, R + 4, 0, 100)!} fill="none" stroke="var(--color-border)" strokeWidth={1} />
      <path d={arcPath(cx, CY, BAND, REDLINE_FROM, 100)!} fill="none" stroke={RED} strokeOpacity={0.75} strokeWidth={6} />
      {usedArc && <path data-testid="gauge-used" d={usedArc} fill="none" stroke={ACCENT} strokeWidth={6}><title>Used {Math.round(used)}%</title></path>}
      {projectedArc && <path data-testid="gauge-projection" d={projectedArc} fill="none" stroke={`url(#${hatchId})`} strokeWidth={6}><title>Projected at reset {Math.round(projected)}%</title></path>}
      {ticks}
      {elapsedMarker && (
        <polygon data-testid="gauge-now" points={elapsedMarker} fill="var(--color-fg)">
          <title>Time elapsed {Math.round(pace.elapsedPct!)}%</title>
        </polygon>
      )}
      <line x1={cx} y1={CY} x2={nx} y2={ny} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" style={{ transition: 'all 0.6s ease' }} />
      <circle cx={cx} cy={CY} r={7} fill="var(--color-fg)" />
      <circle cx={cx} cy={CY} r={2.5} fill="var(--color-sidebar)" />
      <text x={cx} y={CY + 34} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-fg)" className="tabular-nums">
        {win.pct == null ? '—' : `${win.pct}%`}
      </text>
      <text x={cx} y={CY + 49} textAnchor="middle" fontSize="9" letterSpacing="1.5" fontWeight="600" fill="var(--color-fg-muted)">
        {win.label.toUpperCase()}
      </text>
    </g>
  )
}

// Fuel-pump warning light, centred between the dials with its bottom just
// above the level where their arcs start (y ≈ 142).
function FuelLight({ out, title }: { out: boolean; title: string }) {
  const size = 18
  const scale = size / 24
  const x = DIAL_W + GAP / 2 - size / 2
  const y = 138 - size
  return (
    <g
      data-testid="fuel-light"
      data-out={out ? 'true' : 'false'}
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      stroke={out ? RED : 'var(--color-fg-subtle)'}
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={out ? 'motion-safe:animate-pulse' : undefined}
      style={out ? { filter: `drop-shadow(0 0 4px ${RED})` } : undefined}
    >
      <title>{title}</title>
      {/* Transparent hit area so hovering anywhere on the icon shows the title. */}
      <rect x={0} y={0} width={24} height={24} fill="transparent" stroke="none" />
      <rect x={3} y={3} width={11} height={18} rx={1.5} />
      <path d="M5.5 8h6" />
      <path d="M14 9l3.5 2.5V18a1.75 1.75 0 0 0 3.5 0v-7.5L18 7" />
    </g>
  )
}

function GaugeFooter({ win, pace, now }: { win: GaugeWindow; pace: Pace; now: number }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      {isOut(win) ? (
        <span data-testid="pace-chip" className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[0.6875rem] text-red-500 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Limit reached
        </span>
      ) : pace.status && (
        <span data-testid="pace-chip" className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.6875rem] ${PACE_CHIP[pace.status]}`}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          {paceChipText(pace.status, pace.projectedPct, win.cutoffAt, now)}
        </span>
      )}
      <span className="text-xs leading-relaxed text-fg-muted">
        Resets in <span className="font-mono tabular-nums text-accent">{formatCountdown(win.resetAt, now)}</span>
        <br />
        {formatResetTime(win.resetAt)} · <span className="font-mono tabular-nums">{formatBurnRate(win.ratePerHour)}</span>
      </span>
    </div>
  )
}

export function UsageGauges({ session, week, now }: { session: GaugeWindow; week: GaugeWindow; now: number }) {
  const hatchId = `usage-hatch-${useId().replace(/:/g, '')}`
  const paceOf = (w: GaugeWindow) => computePace(w.pct, w.resetAt, w.ratePerHour, w.cutoffAt, w.windowHours, now)
  const sessionPace = paceOf(session)
  const weekPace = paceOf(week)
  const outWindows = [session, week].filter(isOut)
  const lightTitle = outWindows.length
    ? `Out of usage: ${outWindows.map((w) => w.label.toLowerCase()).join(' and ')} limit reached`
    : 'Usage left'

  return (
    <div data-testid="usage-gauges" className="flex flex-col gap-2">
      <svg
        viewBox={`0 -14 ${VIEW_W} 180`}
        className="block w-full overflow-visible font-mono"
        role="img"
        aria-label={`${session.label} ${session.pct ?? 0}% used, ${week.label} ${week.pct ?? 0}% used`}
      >
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={5} stroke={ACCENT} strokeOpacity={0.45} strokeWidth={2.2} />
          </pattern>
        </defs>
        <Dial win={session} pace={sessionPace} x={0} kind="speedo" hatchId={hatchId} />
        <FuelLight out={outWindows.length > 0} title={lightTitle} />
        <Dial win={week} pace={weekPace} x={DIAL_W + GAP} kind="fuel" hatchId={hatchId} />
      </svg>
      <div className="grid grid-cols-2 gap-3">
        <GaugeFooter win={session} pace={sessionPace} now={now} />
        <GaugeFooter win={week} pace={weekPace} now={now} />
      </div>
    </div>
  )
}
