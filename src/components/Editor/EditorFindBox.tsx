import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { EditorFindController, type FindEditor, type FindSnapshot } from '@/lib/editorFindController'
import { useEditorFindStore, type FindToggle } from '@/stores/editorFindStore'

// The floating find / replace box over the top-right of an editor pane.
// Search only is a single row; opening replace switches to three rows (search,
// replace, and a footer with the match count and arrows on the left and the
// replace buttons on the right). Everything is sized in rem, so the global font
// size (which scales the root font size) scales the box with it.

const EMPTY: FindSnapshot = { count: 0, current: 0, truncated: false }
const NOTICE_MS = 3000

const TIPS = {
  caseSensitive: 'Match Case',
  wholeWord: 'Match Whole Word',
  regex: 'Use Regular Expression',
  replace: 'Toggle Replace',
  prev: 'Previous Match',
  next: 'Next Match',
  close: 'Close',
} as const

function accentColor(): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
    return value ? `rgb(${value.split(/\s+/).join(',')})` : '#d8a94c'
  } catch {
    return '#d8a94c'
  }
}

function countLabel(snapshot: FindSnapshot, query: string): string {
  if (!query) return ''
  if (snapshot.error) return 'Invalid regex'
  if (snapshot.count === 0) return 'No results'
  return `${snapshot.current} of ${snapshot.count.toLocaleString()}${snapshot.truncated ? '+' : ''}`
}

type SetTip = (tip: string | null) => void

function tipHandlers(tip: string, setTip: SetTip) {
  return {
    onMouseEnter: () => setTip(tip),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip(tip),
    onBlur: () => setTip(null),
  }
}

function IconButton({ label, onClick, setTip, active = false, children }: {
  label: string
  onClick: () => void
  setTip: SetTip
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      {...tipHandlers(label, setTip)}
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors',
        active ? 'text-accent hover:bg-white/5' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="0.875rem" height="0.875rem" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const CHEVRON_CLOSED = 'M6 3.5L10.5 8L6 12.5'
const CHEVRON_OPEN = 'M3.5 6L8 10.5L12.5 6'
const ARROW_UP = 'M8 13V3M4 7l4-4 4 4'
const ARROW_DOWN = 'M8 3v10M4 9l4 4 4-4'
const CROSS = 'M4 4l8 8M12 4l-8 8'

function OptionToggle({ flag, label, setTip, children }: { flag: FindToggle; label: string; setTip: SetTip; children: string }) {
  const pressed = useEditorFindStore((s) => s[flag])
  const toggle = useEditorFindStore((s) => s.toggle)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={() => toggle(flag)}
      {...tipHandlers(label, setTip)}
      className={[
        'flex h-5 min-w-5 items-center justify-center rounded px-0.5 font-mono text-[0.6875rem] leading-none transition-colors',
        pressed ? 'bg-accent/30 text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

const FIELD = 'h-7 w-full rounded border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70'

export function EditorFindBox({ paneId, editor }: { paneId: string; editor: FindEditor | null }) {
  const pane = useEditorFindStore((s) => s.panes[paneId])
  const query = useEditorFindStore((s) => s.query)
  const replacement = useEditorFindStore((s) => s.replacement)
  const caseSensitive = useEditorFindStore((s) => s.caseSensitive)
  const wholeWord = useEditorFindStore((s) => s.wholeWord)
  const regex = useEditorFindStore((s) => s.regex)
  const navRequest = useEditorFindStore((s) => s.navRequest)
  const { setQuery, setReplacement, closeFind, toggleReplace, clearNavRequest } = useEditorFindStore.getState()

  const open = !!pane?.open && !!editor
  const showReplace = !!pane?.showReplace
  const focusTick = pane?.focusTick ?? 0

  const [controller, setController] = useState<EditorFindController | null>(null)
  const [snapshot, setSnapshot] = useState<FindSnapshot>(EMPTY)
  const [tip, setTip] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seenController = useRef<EditorFindController | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One controller per editor. The pane's Monaco editor is recreated when the
  // tab changes, so this is rebuilt (and the search re-run) for the new file.
  useEffect(() => {
    if (!open || !editor) { setController(null); return }
    const created = new EditorFindController(editor, { onChange: setSnapshot, matchColor: accentColor() })
    setController(created)
    return () => { created.dispose(); setController(null) }
  }, [open, editor])

  // Re-run whenever what is searched for changes. Typing selects the first
  // match after the cursor as you go; simply opening (or switching files) only
  // highlights, so it never moves your cursor.
  const options = { query, caseSensitive, wholeWord, regex }
  useEffect(() => {
    if (!controller) return
    const first = seenController.current !== controller
    seenController.current = controller
    setSnapshot(controller.refresh(options, { select: !first }))
  }, [controller, query, caseSensitive, wholeWord, regex])

  // F3 / Cmd+G from the editor.
  useEffect(() => {
    if (!controller || !navRequest || navRequest.paneId !== paneId) return
    setSnapshot(navRequest.delta === 1 ? controller.next() : controller.prev())
    clearNavRequest()
  }, [controller, navRequest, paneId])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open, focusTick])

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  if (!open || !editor) return null

  const canReplace = snapshot.count > 0 && !snapshot.error

  function close() {
    closeFind(paneId)
    editor?.focus()
  }

  function flash(message: string) {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }

  function replaceOne() {
    if (controller) setSnapshot(controller.replaceCurrent(options, replacement))
  }

  function replaceEverything() {
    if (!controller) return
    const replaced = controller.replaceAll(options, replacement)
    setSnapshot(controller.getSnapshot())
    if (replaced > 0) flash(`Replaced ${replaced.toLocaleString()}`)
  }

  function onFindKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (controller) setSnapshot(event.shiftKey ? controller.prev() : controller.next())
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  function onReplaceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) replaceEverything()
      else replaceOne()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  const chevron = (
    <IconButton label={TIPS.replace} onClick={() => toggleReplace(paneId)} setTip={setTip} active={showReplace}>
      <Glyph d={showReplace ? CHEVRON_OPEN : CHEVRON_CLOSED} />
    </IconButton>
  )

  const searchField = (
    <div className="relative min-w-0">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onFindKeyDown}
        placeholder="Find"
        aria-label="Find"
        spellCheck={false}
        className={`${FIELD} pr-[4.75rem] ${snapshot.error ? 'border-red-400/70' : ''}`}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        <OptionToggle flag="caseSensitive" label={TIPS.caseSensitive} setTip={setTip}>Aa</OptionToggle>
        <OptionToggle flag="wholeWord" label={TIPS.wholeWord} setTip={setTip}>ab</OptionToggle>
        <OptionToggle flag="regex" label={TIPS.regex} setTip={setTip}>.*</OptionToggle>
      </div>
    </div>
  )

  const nav = (
    <span className="flex min-w-0 items-center gap-0.5">
      <span className={`whitespace-nowrap px-1 text-xs tabular-nums ${snapshot.error ? 'text-red-300' : 'text-fg-muted'}`}>
        {notice ?? countLabel(snapshot, query)}
      </span>
      <IconButton label={TIPS.prev} onClick={() => controller && setSnapshot(controller.prev())} setTip={setTip}>
        <Glyph d={ARROW_UP} />
      </IconButton>
      <IconButton label={TIPS.next} onClick={() => controller && setSnapshot(controller.next())} setTip={setTip}>
        <Glyph d={ARROW_DOWN} />
      </IconButton>
    </span>
  )

  const closeButton = (
    <IconButton label={TIPS.close} onClick={close} setTip={setTip}>
      <Glyph d={CROSS} />
    </IconButton>
  )

  return (
    <div
      role="search"
      aria-label="Find in file"
      className="absolute right-4 top-2 z-20 w-[min(26rem,calc(100%-1.5rem))] rounded-md border border-border bg-popover p-2.5 shadow-xl shadow-black/50"
    >
      {showReplace ? (
        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-x-1 gap-y-2">
          {chevron}
          {searchField}
          {closeButton}
          <span />
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder={regex ? 'Replace ($1, $2 for groups)' : 'Replace'}
            aria-label="Replace with"
            spellCheck={false}
            className={FIELD}
          />
          <span />
          <div className="col-span-2 col-start-2 flex items-center gap-1.5">
            {nav}
            <span className="flex-1" />
            <button
              type="button"
              disabled={!canReplace}
              onClick={replaceOne}
              className="h-7 shrink-0 rounded border border-accent/70 px-2.5 text-xs text-accent transition-colors hover:bg-white/5 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={!canReplace}
              onClick={replaceEverything}
              className="h-7 shrink-0 rounded border border-border px-2.5 text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
            >
              Replace all
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {chevron}
          <div className="min-w-[8rem] flex-1">{searchField}</div>
          {nav}
          {closeButton}
        </div>
      )}

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-200"
        >
          {tip}
        </div>
      )}
    </div>
  )
}
