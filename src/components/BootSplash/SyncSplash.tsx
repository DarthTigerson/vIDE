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

// Three pipes in from each side, converging on the chip at (352..448, 202..298).
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
        <svg x={376} y={226} width={48} height={48} viewBox="0 0 24 24" fill="none">
          <path
            className="sync-splash__icon"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </svg>
      <div className="sync-splash__label">Syncing settings…</div>
    </div>
  )
}
