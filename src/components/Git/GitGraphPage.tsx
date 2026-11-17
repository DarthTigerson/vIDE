import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import type { GitCommit } from '@/types/index'
import { useGitGraphStore, useRepoGraphState } from '@/stores/gitGraphStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitSettingsStore, REFS_COLUMN_MIN_WIDTH, REFS_COLUMN_MAX_WIDTH } from '@/stores/gitSettingsStore'
import { computeLayout } from './graphLayout'
import type { CommitLayout, RowEdge } from './graphLayout'
import { normalizeRef, formatExactDate, formatRelDate, refTone } from './commitFormat'
import { CommitContextMenu } from './CommitContextMenu'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { useInfiniteScroll } from './useInfiniteScroll'
import { ColumnResizeDivider } from './ColumnResizeDivider'
import { RefreshIcon } from './RefreshIcon'
import { CommitFilterBar } from './CommitFilterBar'
import { filterCommits, hasActiveFilters } from './commitFilter'

export const ROW_H = 72
const LANE_W = 40
const LANE_PAD = 24
const DOT_R = 11
// A floor just above what a single lane already needs (LANE_W + LANE_PAD*2
// = 88) — the dot is centered in this column, so any width beyond what the
// lanes actually need becomes dead space on both sides of it. Previously
// 320, which reserved room for ~6 lanes' worth of width even on a plain
// linear (1-lane) history.
const MIN_GRAPH_W = 90

function laneX(lane: number, railWidth: number, laneCount: number): number {
  const visibleLanes = Math.max(1, laneCount)
  const laneSpan = (visibleLanes - 1) * LANE_W
  return (railWidth - laneSpan) / 2 + lane * LANE_W
}

// Standard cubic-bezier approximation of a circular quarter-turn: a control
// point placed this fraction of the radius along the tangent direction from
// each endpoint reproduces a true quarter circle to within ~0.03% — visually
// exact. Used instead of SVG's native arc command (`A`) because getting an
// S-shape's two opposite-curving arcs' sweep-flags right by hand is easy to
// get subtly wrong (an earlier version of this code did) and produces a
// visible kink where they meet instead of one smooth flow; specifying the
// tangent DIRECTION at each join directly, as this does, can't have that bug.
const CIRCLE_K = (4 / 3) * (Math.sqrt(2) - 1)

// A lane change is drawn as a straight vertical lead-in, a quarter-circle
// curving from vertical into horizontal, a straight horizontal jog (only
// needed if the lanes are more than one apart), a mirrored quarter-circle
// curving back from horizontal into vertical, then a straight vertical
// trail-out. Two edges swapping lanes in the same row (a merge-in and a
// branch-out sharing a row) are mirror images of each other and so meet
// exactly at the same point, dead center between the two lanes both
// vertically and horizontally, instead of crossing at some arbitrary
// bezier-timing-dependent spot.
export function edgePath(
  edge: RowEdge,
  railWidth: number,
  laneCount: number,
  currentLane: number,
  rowIndex: number
): string {
  const x1 = laneX(edge.fromLane, railWidth, laneCount)
  const x2 = laneX(edge.toLane, railWidth, laneCount)
  const y1 = rowIndex === 0 && edge.fromLane === currentLane ? ROW_H / 2 : 0
  const yEnd = ROW_H
  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${yEnd}`
  }

  const dx = x2 - x1
  const dir = dx > 0 ? 1 : -1
  const totalDy = yEnd - y1
  // Each arc needs equal radius vertically and horizontally to be a true
  // quarter circle, so it's bounded by whichever of the two spans (the
  // full lane gap, or the full row height) is smaller — if the lanes are
  // far enough apart that the gap exceeds the row height, the arcs use all
  // the available vertical space and a straight horizontal jog covers the
  // remaining horizontal distance between them.
  const r = Math.min(Math.abs(dx), totalDy) / 2
  const k = CIRCLE_K * r
  const midY = y1 + totalDy / 2
  const arc1EndX = x1 + r * dir
  const arc2StartX = x2 - r * dir
  const leadInEndY = midY - r
  const trailOutStartY = midY + r

  const segments = [`M ${x1} ${y1}`]
  if (leadInEndY > y1) segments.push(`L ${x1} ${leadInEndY}`)
  // Arc 1: leaves (x1, leadInEndY) heading straight down, arrives at
  // (arc1EndX, midY) heading horizontally in `dir`.
  segments.push(`C ${x1} ${leadInEndY + k} ${arc1EndX - k * dir} ${midY} ${arc1EndX} ${midY}`)
  if (arc2StartX !== arc1EndX) segments.push(`L ${arc2StartX} ${midY}`)
  // Arc 2: leaves (arc2StartX, midY) heading horizontally in `dir` (matching
  // arc 1's exit direction exactly, so the join has no kink), arrives at
  // (x2, trailOutStartY) heading straight down again.
  segments.push(`C ${arc2StartX + k * dir} ${midY} ${x2} ${trailOutStartY - k} ${x2} ${trailOutStartY}`)
  if (trailOutStartY < yEnd) segments.push(`L ${x2} ${yEnd}`)
  return segments.join(' ')
}

function graphWidth(laneCount: number): number {
  return Math.max(MIN_GRAPH_W, Math.max(1, laneCount) * LANE_W + LANE_PAD * 2)
}

function nodeMeta(
  commit: CommitLayout['commit'],
  color: string
): {
  fill: string
  ring: string
  glyph: string | null
  text: string
  glow: number
} {
  if (commit.refs.some((ref) => ref.startsWith('tag: '))) {
    return { fill: '#facc15', ring: '#fde047', glyph: 'T', text: '#1f2937', glow: 0.34 }
  }
  if (commit.parents.length > 1) {
    return { fill: color, ring: '#fb923c', glyph: 'M', text: '#ffffff', glow: 0.28 }
  }
  if (commit.refs.some((ref) => ref.includes('HEAD'))) {
    return { fill: color, ring: '#93c5fd', glyph: 'H', text: '#ffffff', glow: 0.26 }
  }
  if (commit.refs.some((ref) => ref.startsWith('origin/'))) {
    return { fill: color, ring: '#fca5a5', glyph: 'R', text: '#ffffff', glow: 0.22 }
  }
  if (commit.refs.length > 0) {
    return { fill: color, ring: '#86efac', glyph: 'B', text: '#ffffff', glow: 0.22 }
  }
  return { fill: color, ring: 'var(--color-panel)', glyph: null, text: '#ffffff', glow: 0.12 }
}

// computeLayout pushes edges in lane-index order, not paint order — a
// straight pass-through for a low-index lane (e.g. the leftmost, primary
// pipe) can end up earlier in the array than a diagonal edge from a higher
// lane whose curve happens to pass through that same x (a merge-in
// targeting that lane is the common case). Since later SVG elements paint
// over earlier ones, that diagonal edge would visibly interrupt the
// straight pipe with its own color. Rendering all straight edges last keeps
// every straight pipe visually unbroken; diagonals duck behind them.
export function orderEdgesForPaint(edges: RowEdge[]): RowEdge[] {
  return [...edges].sort(
    (a, b) => Number(a.fromLane === a.toLane) - Number(b.fromLane === b.toLane)
  )
}

function GraphRow({ layout, rowIndex, selected, graphRailWidth, graphLaneCount, refsColumnWidth, onClick, onContextMenu }: {
  layout: CommitLayout
  rowIndex: number
  selected: boolean
  graphRailWidth: number
  graphLaneCount: number
  refsColumnWidth: number
  onClick: () => void
  onContextMenu: (event: MouseEvent) => void
}) {
  const { commit, lane, color, edges } = layout
  const orderedEdges = orderEdgesForPaint(edges)
  const svgW = graphRailWidth
  const laneCount = Math.max(graphLaneCount, layout.totalLanes, layout.lane + 1)
  const cx = laneX(lane, svgW, laneCount)
  const isMerge = commit.parents.length > 1
  const meta = nodeMeta(commit, color)
  const refs = commit.refs.slice(0, 3)

  return (
    <button
      type="button"
      style={{
        gridTemplateColumns: `${refsColumnWidth}px ${svgW}px minmax(140px, 1.5fr)`,
        background: selected
          ? `linear-gradient(90deg, transparent 0%, ${color}22 35%, ${color}1c 65%, transparent 100%)`
          : undefined,
      }}
      className={[
        'w-full grid items-center text-left cursor-pointer select-none group transition-colors border-l-2 focus:outline-hidden focus-visible:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#2563eb]/70',
        selected
          ? 'border-l-[#2563eb]'
          : 'border-l-transparent hover:bg-white/[0.04]',
      ].join(' ')}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-pressed={selected}
    >
      <div className="min-w-0 px-4 justify-self-end">
        {refs.length > 0 ? (
          <div className="flex justify-end flex-wrap gap-1">
            {refs.map((ref) => (
              <span
                key={ref}
                className={[
                  'max-w-36 truncate text-[0.5625rem] font-semibold px-1.5 py-0.5 rounded-sm border leading-none',
                  refTone(ref),
                ].join(' ')}
              >
                {normalizeRef(ref)}
              </span>
            ))}
            {commit.refs.length > refs.length && (
              <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-sm border border-border text-fg-muted leading-none">
                +{commit.refs.length - refs.length}
              </span>
            )}
          </div>
        ) : (
          <span className="block text-[0.625rem] text-fg-subtle opacity-0 group-hover:opacity-70">
            {formatRelDate(commit.date)}
          </span>
        )}
      </div>

      <div className="relative justify-self-center" style={{ width: svgW }}>
        <svg width={svgW} height={ROW_H} className="overflow-visible block">
          {Array.from({ length: laneCount }).map((_, i) => (
            <line
              key={`guide-${i}`}
              x1={laneX(i, svgW, laneCount)}
              y1={0}
              x2={laneX(i, svgW, laneCount)}
              y2={ROW_H}
              stroke="var(--color-fg-subtle)"
              strokeWidth={1}
              opacity={0.12}
            />
          ))}
          {orderedEdges.map((edge, i) => (
            <path
              key={i}
              d={edgePath(edge, svgW, laneCount, lane, rowIndex)}
              stroke={edge.color}
              strokeWidth={4}
              fill="none"
              opacity={selected ? 1 : 0.86}
              strokeLinecap="round"
            />
          ))}
          <circle
            cx={cx}
            cy={ROW_H / 2}
            r={DOT_R + 9}
            fill={meta.fill}
            opacity={selected ? meta.glow + 0.14 : meta.glow}
          />
          <circle
            cx={cx}
            cy={ROW_H / 2}
            r={DOT_R + 2}
            fill="var(--color-panel)"
            stroke={meta.ring}
            strokeWidth={selected ? 3.5 : 2.5}
          />
          <circle cx={cx} cy={ROW_H / 2} r={DOT_R - 1} fill={meta.fill} />
          {meta.glyph ? (
            <text
              x={cx}
              y={ROW_H / 2 + 3}
              textAnchor="middle"
              className="font-mono font-bold"
              fontSize={9}
              fill={meta.text}
            >
              {meta.glyph}
            </text>
          ) : (
            <circle cx={cx} cy={ROW_H / 2} r={3} fill="white" opacity={0.9} />
          )}
        </svg>
      </div>

      <div className="min-w-0 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-fg truncate flex-1">{commit.subject}</span>
          {isMerge && (
            <span className="shrink-0 text-[0.5625rem] leading-none px-1.5 py-1 rounded-sm border border-[#fb923c]/70 bg-[#fb923c]/20 text-[var(--ref-orange-text)]">
              merge
            </span>
          )}
        </div>
        <div className="mt-1 text-[0.625rem] text-fg-subtle truncate opacity-70">
          {commit.hash.slice(0, 7)} · {formatExactDate(commit.date)}
        </div>
      </div>
    </button>
  )
}

// Used instead of GraphRow whenever search/filters are active. Filtering the
// commit array breaks the lane graph's edges — computeLayout assigns lanes by
// walking commits in order and tracking each row's expected parent hash, so
// a filtered-out commit leaves a lane "waiting" forever for a hash that will
// never appear, and edges are drawn relative to adjacent *rendered* rows, so
// skipping rows misaligns them too. A flat list sidesteps both problems.
function FilteredRow({ commit, refsColumnWidth, selected, onClick, onContextMenu }: {
  commit: GitCommit
  refsColumnWidth: number
  selected: boolean
  onClick: () => void
  onContextMenu: (event: MouseEvent) => void
}) {
  const refs = commit.refs.slice(0, 3)

  return (
    <button
      type="button"
      style={{
        gridTemplateColumns: `${refsColumnWidth}px minmax(140px, 1.5fr)`,
        background: selected
          ? 'linear-gradient(90deg, transparent 0%, #2563eb22 35%, #2563eb1c 65%, transparent 100%)'
          : undefined,
        minHeight: ROW_H,
      }}
      className={[
        'w-full grid items-center text-left group transition-colors border-l-2 focus:outline-hidden focus-visible:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#2563eb]/70',
        selected ? 'border-l-[#2563eb]' : 'border-l-transparent hover:bg-white/[0.04]',
      ].join(' ')}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-pressed={selected}
    >
      <div className="min-w-0 px-4 justify-self-end">
        {refs.length > 0 && (
          <div className="flex justify-end flex-wrap gap-1">
            {refs.map((ref) => (
              <span
                key={ref}
                className={`max-w-36 truncate text-[0.5625rem] font-semibold px-1.5 py-0.5 rounded-sm border leading-none ${refTone(ref)}`}
              >
                {normalizeRef(ref)}
              </span>
            ))}
            {commit.refs.length > refs.length && (
              <span className="text-[0.5625rem] px-1.5 py-0.5 rounded-sm border border-border text-fg-muted leading-none">
                +{commit.refs.length - refs.length}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 px-4 py-2">
        <div className="text-xs text-fg truncate">{commit.subject}</div>
        <div className="mt-1 text-[0.625rem] text-fg-subtle truncate">
          {commit.hash.slice(0, 7)} · {commit.author} · {formatExactDate(commit.date)}
        </div>
      </div>
    </button>
  )
}

interface RowMenuState {
  x: number
  y: number
  message: string
  hash: string
}

export function GitGraphPage() {
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const { commits, selectedHash, loading, loadingMore, hasMore, filters } = useRepoGraphState(selectedRepo)
  const load = useGitGraphStore((s) => s.load)
  const loadMore = useGitGraphStore((s) => s.loadMore)
  const select = useGitGraphStore((s) => s.select)
  const setFilters = useGitGraphStore((s) => s.setFilters)
  const storedRefsColumnWidth = useGitSettingsStore((s) => s.refsColumnWidth)
  const setRefsColumnWidth = useGitSettingsStore((s) => s.setRefsColumnWidth)
  const [liveRefsColumnWidth, setLiveRefsColumnWidth] = useState<number | null>(null)
  const refsColumnWidth = liveRefsColumnWidth ?? storedRefsColumnWidth
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null)

  useEffect(() => {
    if (selectedRepo) load(selectedRepo)
  }, [selectedRepo, load])

  const handleLoadMore = useCallback(() => {
    if (selectedRepo) loadMore(selectedRepo)
  }, [selectedRepo, loadMore])
  const sentinelRef = useInfiniteScroll(handleLoadMore, hasMore, loading || loadingMore)

  const selectedCommit = commits.find((c) => c.hash === selectedHash) ?? null

  const isFiltered = hasActiveFilters(filters)
  const visibleCommits = useMemo(() => filterCommits(commits, filters), [commits, filters])
  const layouts = isFiltered ? [] : computeLayout(commits)
  const graphLaneCount = layouts.reduce(
    (count, layout) => Math.max(count, layout.totalLanes, layout.lane + 1),
    1
  )
  const graphRailWidth = graphWidth(graphLaneCount)

  const handleSelect = useCallback((hash: string) => {
    if (!selectedRepo) return
    select(selectedRepo, selectedHash === hash ? null : hash)
  }, [selectedRepo, selectedHash, select])

  function handleRowContextMenu(event: MouseEvent, message: string, hash: string) {
    event.preventDefault()
    setRowMenu({ x: event.clientX, y: event.clientY, message, hash })
  }

  return (
    <div className="h-full flex overflow-hidden bg-panel">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-11 px-4 border-b border-border shrink-0 flex items-center justify-between">
          <span className="text-[0.625rem] font-semibold text-fg-muted uppercase tracking-wider">
            Git Graph
          </span>
          <button
            type="button"
            onClick={() => selectedRepo && load(selectedRepo)}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            className="text-fg-muted hover:text-fg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshIcon className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        <CommitFilterBar
          commits={commits}
          filters={filters}
          onSearchTextChange={(searchText) => selectedRepo && setFilters(selectedRepo, { searchText })}
          onBranchesChange={(branches) => selectedRepo && setFilters(selectedRepo, { branches })}
          onTagsChange={(tags) => selectedRepo && setFilters(selectedRepo, { tags })}
          onAuthorsChange={(authors) => selectedRepo && setFilters(selectedRepo, { authors })}
        />

        <div className="flex-1 relative overflow-hidden">
          <div className="h-full overflow-y-auto">
            {loading && commits.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-fg-subtle">
                Loading history…
              </div>
            ) : isFiltered ? (
              visibleCommits.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-fg-subtle">
                  No matching commits
                </div>
              ) : (
                visibleCommits.map((commit) => (
                  <FilteredRow
                    key={commit.hash}
                    commit={commit}
                    refsColumnWidth={refsColumnWidth}
                    selected={commit.hash === selectedHash}
                    onClick={() => handleSelect(commit.hash)}
                    onContextMenu={(e) => handleRowContextMenu(e, commit.subject, commit.hash)}
                  />
                ))
              )
            ) : layouts.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-fg-subtle">
                No commits found
              </div>
            ) : (
              <>
                {layouts.map((layout, index) => (
                  <GraphRow
                    key={layout.commit.hash}
                    layout={layout}
                    rowIndex={index}
                    graphRailWidth={graphRailWidth}
                    graphLaneCount={graphLaneCount}
                    refsColumnWidth={refsColumnWidth}
                    selected={layout.commit.hash === selectedHash}
                    onClick={() => handleSelect(layout.commit.hash)}
                    onContextMenu={(e) => handleRowContextMenu(e, layout.commit.subject, layout.commit.hash)}
                  />
                ))}
                {hasMore && (
                  <div ref={sentinelRef} className="h-10 flex items-center justify-center text-[0.625rem] text-fg-subtle">
                    {loadingMore ? 'Loading more…' : ''}
                  </div>
                )}
              </>
            )}
          </div>
          {(isFiltered ? visibleCommits.length > 0 : layouts.length > 0) && (
            <ColumnResizeDivider
              width={refsColumnWidth}
              min={REFS_COLUMN_MIN_WIDTH}
              max={REFS_COLUMN_MAX_WIDTH}
              onResize={setLiveRefsColumnWidth}
              onCommit={(w) => { setRefsColumnWidth(w); setLiveRefsColumnWidth(null) }}
            />
          )}
        </div>
      </div>

      {selectedCommit && selectedRepo && (
        <CommitDetailsPanel
          cwd={selectedRepo}
          commit={selectedCommit}
          onClose={() => select(selectedRepo, null)}
        />
      )}

      {rowMenu && (
        <CommitContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          message={rowMenu.message}
          hash={rowMenu.hash}
          onClose={() => setRowMenu(null)}
        />
      )}
    </div>
  )
}
