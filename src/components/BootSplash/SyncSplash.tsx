import type { CSSProperties } from 'react'
import type { SplashPalette } from '@/lib/splashPalette'
import './SyncSplash.css'

// How long the colour swap takes from the moment the palette changes (the
// slowest element's delay + duration in SyncSplash.css). main.tsx holds the
// app back this long so the swap isn't cut off by App mounting.
export const SPLASH_SWAP_MS = 1300

export function swapHoldMs(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SPLASH_SWAP_MS
}

// Three pipes in from each side, stopping just short of the icon at the centre
// (x 352 / 448).
const LEFT_PIPES = [
  'M0 130 H140 L180 170 H260 L300 210 H352',
  'M0 250 H352',
  'M0 370 H160 L200 330 H300 L320 290 H352',
]
const RIGHT_PIPES = [
  'M800 130 H660 L620 170 H540 L500 210 H448',
  'M800 250 H448',
  'M800 370 H640 L600 330 H500 L480 290 H448',
]
const PIPES = [...LEFT_PIPES, ...RIGHT_PIPES]
const LEFT_NODES: Array<[number, number]> = [[140, 130], [260, 170], [120, 250], [160, 370], [300, 330]]
const NODES = [...LEFT_NODES, ...LEFT_NODES.map(([x, y]): [number, number] => [800 - x, y])]

// vIDE's hex emblem (the app icon), in a 100x100 box: three thick outer
// segments with gaps at alternate corners, a thin inner hex, and a solid core.
const EMBLEM_SEGMENTS = [
  'M82.9 37.1 L82.9 69 L55.3 85',
  'M44.7 85 L17.1 69 L17.1 37.1',
  'M22.4 28 L50 12 L77.6 28',
]
const EMBLEM_INNER = '50 27 69.9 38.5 69.9 61.5 50 73 30.1 61.5 30.1 38.5'
const EMBLEM_CORE = '50 38 60.4 44 60.4 56 50 62 39.6 56 39.6 44'

const vars = (v: Record<string, string>) => v as CSSProperties

export function SyncSplash({ palette }: { palette: SplashPalette }) {
  return (
    <div
      className="sync-splash"
      data-testid="sync-splash"
      data-tone={palette.isLight ? 'light' : 'dark'}
      style={vars({ '--splash-bg': palette.bg, '--splash-accent': palette.accent })}
    >
      <div className="sync-splash__grid" />
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {PIPES.map((d, i) => (
          <g key={d}>
            {/* Edge-to-edge stagger for the recolour: 0 - 0.3 s. */}
            <path
              className="sync-splash__trace"
              data-pipe=""
              d={d}
              pathLength={100}
              style={vars({ '--sd': `${(i % 3) * 0.15}s` })}
            />
            <path
              className="sync-splash__pulse"
              d={d}
              pathLength={100}
              style={vars({ '--t': `${2.2 + (i % 3) * 0.55}s`, '--d': `-${(i * 0.47).toFixed(2)}s` })}
            />
          </g>
        ))}
        {NODES.map(([cx, cy]) => (
          <circle key={`${cx},${cy}`} className="sync-splash__node" cx={cx} cy={cy} r={3.6} />
        ))}
        <svg className="sync-splash__emblem" x={364} y={214} width={72} height={72} viewBox="0 0 100 100" fill="none">
          {EMBLEM_SEGMENTS.map((d) => (
            <path key={d} className="sync-splash__emblem-ring" d={d} strokeWidth={9} />
          ))}
          <polygon className="sync-splash__emblem-inner" points={EMBLEM_INNER} strokeWidth={2.4} />
          <polygon className="sync-splash__icon" points={EMBLEM_CORE} />
        </svg>
      </svg>
      <div className="sync-splash__label">Syncing settings…</div>
    </div>
  )
}
