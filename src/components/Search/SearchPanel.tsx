import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { SearchHit } from '../../../electron/searchTypes'
import { useFileStore } from '@/stores/fileStore'
import { Modal } from '@/components/ui/Modal'
import { UndoToast } from '@/components/ui/UndoToast'
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

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
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
  replace: 'Replace',
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

function SwapIcon({ size = '0.875rem' }: { size?: string }) {
  return (
    <svg data-icon="replace" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 5h10m0 0L10 2.5M12.5 5L10 7.5M13.5 11h-10m0 0L6 8.5M3.5 11L6 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Revealed on row hover (or keyboard focus) so the result list stays quiet.
function RowReplaceButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted opacity-0 transition-opacity hover:bg-white/10 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
    >
      <SwapIcon size="0.75rem" />
    </button>
  )
}

function GroupRow({ group, root, collapsed, activeKey, canReplace, onToggle, onOpen, onReplaceFile, onReplaceHit }: {
  group: ResultGroup
  root: string | null
  collapsed: boolean
  activeKey: string | null
  canReplace: boolean
  onToggle: () => void
  onOpen: (hit: SearchHit) => void
  onReplaceFile: () => void
  onReplaceHit: (hit: SearchHit) => void
}) {
  const name = basename(group.path)
  const dir = relativeDir(root, group.path)
  return (
    <li>
      <div className="group flex items-center hover:bg-white/5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
      >
        <Chevron open={!collapsed} />
        <span className="shrink-0 text-sm text-fg">{name}</span>
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
      {canReplace && (
        <RowReplaceButton
          label={`Replace in ${name}`}
          title="Replace all matches in this file"
          onClick={onReplaceFile}
        />
      )}
      </div>
      {!collapsed && (
        <ul>
          {group.hits.map((hit) => {
            const key = hitKey(hit)
            return (
              <li key={key}>
                <div className={`group flex items-center hover:bg-white/5 ${activeKey === key ? 'bg-accent/20' : ''}`}>
                  <button
                    type="button"
                    data-hit-key={key}
                    onClick={() => onOpen(hit)}
                    className={`flex min-w-0 flex-1 items-baseline gap-2 py-0.5 pl-6 pr-2 text-left ${
                      group.stale ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="w-7 shrink-0 text-right font-mono text-[0.65rem] text-fg-subtle">{hit.line}</span>
                    <HitText hit={hit} />
                  </button>
                  {canReplace && (
                    <RowReplaceButton
                      label={`Replace match on line ${hit.line} of ${name}`}
                      title="Replace this match"
                      onClick={() => onReplaceHit(hit)}
                    />
                  )}
                </div>
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
  const regex = useGlobalSearchStore((s) => s.regex)
  const replacement = useGlobalSearchStore((s) => s.replacement)
  const replacing = useGlobalSearchStore((s) => s.replacing)
  const pendingReplaceAll = useGlobalSearchStore((s) => s.pendingReplaceAll)
  const replaceOutcome = useGlobalSearchStore((s) => s.replaceOutcome)
  const { setReplacement, replaceHit, replaceFile, requestReplaceAll, cancelReplaceAll, confirmReplaceAll, undoReplace, dismissReplaceOutcome } =
    useGlobalSearchStore.getState()
  const { setQuery, setInclude, setExclude, refresh, clear, toggleCollapsed, moveActive, openHit } =
    useGlobalSearchStore.getState()

  const [showDetails, setShowDetails] = useState(() => include !== '' || exclude !== '')
  const [showReplace, setShowReplace] = useState(() => replacement !== '')
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

  // The undo toast (and any "nothing replaced" notice) clears itself; undo
  // stays available for as long as it is showing.
  useEffect(() => {
    if (!replaceOutcome) return
    const timer = setTimeout(dismissReplaceOutcome, 10_000)
    return () => clearTimeout(timer)
  }, [replaceOutcome, dismissReplaceOutcome])

  const stale = groups.some((g) => g.stale)
  // Replacing needs a finished search: while results are still streaming the
  // list is incomplete, so "replace all" would miss some.
  const canReplace = showReplace && status === 'done' && matchCount > 0 && !replacing
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
                  className="h-7 w-full rounded border border-border bg-bg pl-2 pr-[6.5rem] text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('')
                      inputRef.current?.focus()
                    }}
                    className="absolute right-[4.75rem] top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
                  >
                    <svg width="0.625rem" height="0.625rem" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
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
              <IconButton
                label="Toggle Replace"
                onClick={() => setShowReplace((v) => !v)}
                active={showReplace}
                tip={TIPS.replace}
                setTip={setTip}
              >
                <SwapIcon />
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

            {showReplace && (
              <div className="flex items-center gap-1">
                <input
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); requestReplaceAll() }
                  }}
                  placeholder={regex ? 'Replace ($1, $2 for groups)' : 'Replace'}
                  aria-label="Replace with"
                  spellCheck={false}
                  className="h-7 min-w-0 flex-1 rounded border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
                />
                <button
                  type="button"
                  disabled={!canReplace}
                  onClick={requestReplaceAll}
                  className="h-7 shrink-0 rounded border border-border px-2 text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                >
                  Replace all
                </button>
              </div>
            )}

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
                      canReplace={canReplace}
                      onToggle={() => toggleCollapsed(group.path)}
                      onOpen={(hit) => void openHit(hit)}
                      onReplaceFile={() => void replaceFile(group.path)}
                      onReplaceHit={(hit) => void replaceHit(hit)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      {replaceOutcome && (
        replaceOutcome.records.length > 0
          ? <UndoToast message={replaceOutcome.message} onUndo={() => void undoReplace()} />
          : (
            <button
              type="button"
              onClick={dismissReplaceOutcome}
              title="Dismiss"
              className="absolute bottom-2 left-2 right-2 z-10 rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs text-fg shadow-lg shadow-black/40"
            >
              {replaceOutcome.message}
            </button>
          )
      )}

      {pendingReplaceAll && (
        <Modal onClose={cancelReplaceAll}>
          <h2 className="mb-1 text-sm font-semibold text-fg">Replace all</h2>
          <p className="mb-2 text-sm text-fg-muted">
            {`Replace ${plural(pendingReplaceAll.matches, 'match', 'matches')} in ${plural(pendingReplaceAll.files, 'file')} with ${replacement === '' ? 'nothing' : `“${replacement}”`}?`}
          </p>
          <p className="mb-5 text-xs text-fg-subtle">
            Files open in an editor are changed there and left unsaved. Other files are written to disk. You can undo right afterwards.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={cancelReplaceAll}
              className="rounded-lg border border-border px-4 py-1.5 text-sm text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => void confirmReplaceAll()}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-panel transition-colors hover:bg-accent/80"
            >
              Replace
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
