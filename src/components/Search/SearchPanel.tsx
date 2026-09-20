import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { SearchHit } from '../../../electron/searchTypes'
import { useFileStore } from '@/stores/fileStore'
import { hitKey, useGlobalSearchStore, type ResultGroup, type SearchToggle } from '@/stores/globalSearchStore'

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

// Directory of a file relative to the project root ('' when it sits in the root).
function relativeDir(root: string | null, path: string): string {
  const rel = root && path.startsWith(root + '/') ? path.slice(root.length + 1) : path
  const idx = rel.lastIndexOf('/')
  return idx === -1 ? '' : rel.slice(0, idx)
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`
}

function HitText({ hit }: { hit: SearchHit }) {
  const start = hit.matchStart
  const end = start + hit.length
  return (
    <span className="min-w-0 truncate font-mono text-xs text-fg-subtle">
      {hit.text.slice(0, start)}
      <mark className="rounded-sm bg-accent/40 text-fg not-italic">{hit.text.slice(start, end)}</mark>
      {hit.text.slice(end)}
    </span>
  )
}

type Tip = string

// One tooltip for the whole input row (rendered under it), instead of one per
// button: a per-button popup would be clipped or overflow in a narrow sidebar.
function tipHandlers(tip: Tip, setTip: (tip: Tip | null) => void) {
  return {
    onMouseEnter: () => setTip(tip),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip(tip),
    onBlur: () => setTip(null),
  }
}

const TIPS = {
  caseSensitive: 'Match Case',
  wholeWord: 'Match Whole Word',
  regex: 'Use Regular Expression',
  files: 'Filter by files or folders',
} satisfies Record<string, Tip>

function OptionToggle({ flag, label, children, tip, setTip }: {
  flag: SearchToggle
  label: string
  children: string
  tip: Tip
  setTip: (tip: Tip | null) => void
}) {
  const pressed = useGlobalSearchStore((s) => s[flag])
  const toggle = useGlobalSearchStore((s) => s.toggle)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={() => toggle(flag)}
      {...tipHandlers(tip, setTip)}
      className={[
        'flex h-5 min-w-5 items-center justify-center rounded px-0.5 font-mono text-[0.6875rem] leading-none transition-colors',
        pressed ? 'bg-accent/30 text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="0.75rem"
      height="0.75rem"
      viewBox="0 0 16 16"
      fill="none"
      className={`shrink-0 text-fg-subtle transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconButton({ label, onClick, active = false, tip, setTip, children }: {
  label: string
  onClick: () => void
  active?: boolean
  tip?: Tip
  setTip?: (tip: Tip | null) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={tip ? undefined : label}
      onClick={onClick}
      {...(tip && setTip ? tipHandlers(tip, setTip) : {})}
      className={[
        'flex h-6 w-6 items-center justify-center rounded transition-colors',
        active ? 'text-accent hover:bg-white/5' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function GroupRow({ group, root, collapsed, activeKey, onToggle, onOpen }: {
  group: ResultGroup
  root: string | null
  collapsed: boolean
  activeKey: string | null
  onToggle: () => void
  onOpen: (hit: SearchHit) => void
}) {
  const dir = relativeDir(root, group.path)
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-white/5"
      >
        <Chevron open={!collapsed} />
        <span className="shrink-0 text-sm text-fg">{basename(group.path)}</span>
        {dir && <span className="min-w-0 truncate text-[0.65rem] text-fg-subtle">{dir}</span>}
        {group.stale && (
          <span
            title="This file was edited after the search, so these results may be out of date"
            className="shrink-0 rounded bg-accent/20 px-1 text-[0.6rem] text-accent"
          >
            changed
          </span>
        )}
        <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 text-[0.65rem] text-fg-muted">
          {group.hits.length}
        </span>
      </button>
      {!collapsed && (
        <ul>
          {group.hits.map((hit) => {
            const key = hitKey(hit)
            return (
              <li key={key}>
                <button
                  type="button"
                  data-hit-key={key}
                  onClick={() => onOpen(hit)}
                  className={`flex w-full items-baseline gap-2 py-0.5 pl-6 pr-2 text-left hover:bg-white/5 ${
                    activeKey === key ? 'bg-accent/20' : ''
                  } ${group.stale ? 'opacity-60' : ''}`}
                >
                  <span className="w-7 shrink-0 text-right font-mono text-[0.65rem] text-fg-subtle">{hit.line}</span>
                  <HitText hit={hit} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export function SearchPanel() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const query = useGlobalSearchStore((s) => s.query)
  const include = useGlobalSearchStore((s) => s.include)
  const exclude = useGlobalSearchStore((s) => s.exclude)
  const status = useGlobalSearchStore((s) => s.status)
  const error = useGlobalSearchStore((s) => s.error)
  const truncated = useGlobalSearchStore((s) => s.truncated)
  const groups = useGlobalSearchStore((s) => s.groups)
  const matchCount = useGlobalSearchStore((s) => s.matchCount)
  const diskChanged = useGlobalSearchStore((s) => s.diskChanged)
  const collapsed = useGlobalSearchStore((s) => s.collapsed)
  const activeKey = useGlobalSearchStore((s) => s.activeKey)
  const focusTick = useGlobalSearchStore((s) => s.focusTick)
  const { setQuery, setInclude, setExclude, refresh, clear, toggleCollapsed, moveActive, openHit } =
    useGlobalSearchStore.getState()

  const [showDetails, setShowDetails] = useState(() => include !== '' || exclude !== '')
  const [tip, setTip] = useState<Tip | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusTick])

  useEffect(() => {
    if (!activeKey) return
    const el = listRef.current?.querySelector(`[data-hit-key="${CSS.escape(activeKey)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeKey])

  const stale = groups.some((g) => g.stale)
  const canRefresh = status !== 'idle'

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const active = groups.flatMap((g) => g.hits).find((h) => hitKey(h) === activeKey)
      if (active) void openHit(active)
      else useGlobalSearchStore.getState().runNow()
    } else if (event.key === 'Escape' && query) {
      clear()
      setQuery('')
    }
  }

  let summary: React.ReactNode = null
  if (status === 'searching') {
    summary = <span>{groups.length > 0 ? `${plural(matchCount, 'result')} so far…` : 'Searching…'}</span>
  } else if (status === 'error') {
    summary = <span className="text-red-300">{error}</span>
  } else if (status === 'done') {
    summary = matchCount === 0
      ? <span>{`No results found for “${query}”`}</span>
      : <span>{`${plural(matchCount, 'result')} in ${plural(groups.length, 'file')}`}</span>
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-border bg-sidebar">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Search</span>
        {canRefresh && (
          <IconButton label="Refresh search" onClick={refresh} active={diskChanged || stale}>
            <svg width="0.875rem" height="0.875rem" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5V5h-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}
      </div>

      {!projectRoot ? (
        <p className="px-3 py-3 text-xs text-fg-subtle">Open a folder to search its files.</p>
      ) : (
        <>
          <div className="shrink-0 space-y-1.5 border-b border-border p-2">
            <div className="relative flex items-center gap-1">
              <div className="relative min-w-0 flex-1">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search"
                  aria-label="Search"
                  spellCheck={false}
                  className="h-7 w-full rounded border border-border bg-bg pl-2 pr-[4.75rem] text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
                />
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                  <OptionToggle flag="caseSensitive" label="Match Case" tip={TIPS.caseSensitive} setTip={setTip}>Aa</OptionToggle>
                  <OptionToggle flag="wholeWord" label="Match Whole Word" tip={TIPS.wholeWord} setTip={setTip}>ab</OptionToggle>
                  <OptionToggle flag="regex" label="Use Regular Expression" tip={TIPS.regex} setTip={setTip}>.*</OptionToggle>
                </div>
              </div>
              <IconButton
                label="Filter by files or folders"
                onClick={() => setShowDetails((v) => !v)}
                active={showDetails}
                tip={TIPS.files}
                setTip={setTip}
              >
                <svg data-icon="folder" width="0.9375rem" height="0.9375rem" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M1.75 4.5c0-.69.56-1.25 1.25-1.25h2.6c.33 0 .65.13.88.37l.8.8c.23.24.55.37.88.37H13c.69 0 1.25.56 1.25 1.25v5.4c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25V4.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                </svg>
              </IconButton>
              {tip && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-200"
                >
                  {tip}
                </div>
              )}
            </div>

            {showDetails && (
              <div className="space-y-1">
                <input
                  value={include}
                  onChange={(e) => setInclude(e.target.value)}
                  placeholder="Files to include (e.g. src/**, *.ts)"
                  aria-label="Files to include"
                  spellCheck={false}
                  className="h-7 w-full rounded border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
                />
                <input
                  value={exclude}
                  onChange={(e) => setExclude(e.target.value)}
                  placeholder="Files to exclude"
                  aria-label="Files to exclude"
                  spellCheck={false}
                  className="h-7 w-full rounded border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
                />
              </div>
            )}
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto py-1">
            {status === 'idle' ? (
              <p className="px-3 py-2 text-xs text-fg-subtle">Type to search across the project.</p>
            ) : (
              <>
                <div className="space-y-0.5 px-3 pb-1 text-[0.7rem] text-fg-muted">
                  {summary}
                  {truncated && <div className="text-fg-subtle">Showing the first 10,000 results — narrow the search to see more.</div>}
                  {diskChanged && <div className="text-accent">Files changed on disk since this search.</div>}
                </div>
                <ul>
                  {groups.map((group) => (
                    <GroupRow
                      key={group.path}
                      group={group}
                      root={projectRoot}
                      collapsed={!!collapsed[group.path]}
                      activeKey={activeKey}
                      onToggle={() => toggleCollapsed(group.path)}
                      onOpen={(hit) => void openHit(hit)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
