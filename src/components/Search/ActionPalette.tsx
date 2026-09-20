import { useEffect, useRef, useState } from 'react'
import { getAllCommands } from './commandRegistry'
import type { Command, PaletteStep } from './commands'
import { rankBySearch, withRecentsFirst } from '@/lib/paletteSearch'
import { getRecents, recordRecent } from '@/lib/paletteRecents'
import { ShortcutKeys } from '@/components/ui/ShortcutKeys'

interface Props {
  onClose: () => void
}

interface Row {
  id: string
  label: string
  detail?: string
  reason: string | null
  danger: boolean
  shortcut?: string
}

function listCommands(query: string): Command[] {
  const visible = getAllCommands().filter((cmd) => cmd.condition === undefined || cmd.condition())
  return query.trim() ? rankBySearch(visible, query) : withRecentsFirst(visible, getRecents())
}

export function ActionPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [step, setStep] = useState<PaletteStep | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = step ? [] : listCommands(query)
  const rows: Row[] = step
    ? rankBySearch(step.items, query).map((item) => ({
        id: item.id, label: item.label, detail: item.description, reason: null, danger: false,
      }))
    : commands.map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        detail: cmd.description,
        reason: cmd.disabledReason?.() ?? null,
        danger: cmd.danger === true,
        shortcut: cmd.shortcut,
      }))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, step])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  async function choose(row: Row | undefined) {
    if (!row || row.reason || busy) return
    if (step) {
      onClose()
      step.onPick(row.id)
      return
    }
    const cmd = commands.find((c) => c.id === row.id)
    if (!cmd) return
    recordRecent(cmd.id)
    if (cmd.pick) {
      setBusy(true)
      try {
        setStep(await cmd.pick())
        setQuery('')
      } catch (err) {
        console.error('palette picker failed', err)
      } finally {
        setBusy(false)
      }
      return
    }
    // Close first, then run: same order as before, so actions that move focus
    // (new terminal, editor commands) aren't fighting the palette's input.
    onClose()
    cmd.action?.()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void choose(rows[activeIndex])
    } else if (e.key === 'Escape') {
      if (step) {
        setStep(null)
        setQuery('')
      } else {
        onClose()
      }
    }
  }

  const emptyText = step ? step.emptyText : `No commands matching "${query}"`

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[560px] max-h-[60vh] flex flex-col bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 overflow-hidden">

        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <CmdIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={step ? step.placeholder : 'Run a command…'}
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-fg-subtle hover:text-fg transition-colors">
              <ClearIcon />
            </button>
          )}
        </div>

        {rows.length > 0 && (
          <ul ref={listRef} className="overflow-y-auto flex-1 py-1">
            {rows.map((row, i) => {
              const isActive = i === activeIndex
              const disabled = row.reason !== null
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-disabled={disabled}
                    data-danger={row.danger}
                    onMouseDown={() => void choose(row)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      disabled ? 'opacity-50 cursor-not-allowed' : '',
                      isActive && !disabled ? 'bg-accent/20' : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={[
                          'text-sm font-medium',
                          row.danger ? 'text-red-400' : isActive ? 'text-fg' : 'text-fg-muted',
                        ].join(' ')}
                      >
                        {row.label}
                      </div>
                      {(row.reason ?? row.detail) && (
                        <div className={['text-xs text-fg-subtle truncate', disabled ? 'italic' : ''].join(' ')}>
                          {row.reason ?? row.detail}
                        </div>
                      )}
                    </div>
                    {row.shortcut && <ShortcutKeys shortcut={row.shortcut} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {rows.length === 0 && (
          <div className="px-4 py-6 text-sm text-fg-subtle text-center">{emptyText}</div>
        )}
      </div>
    </div>
  )
}

function CmdIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-fg-subtle shrink-0">
      <path d="M9 3H7a4 4 0 0 0-4 4v2M9 3v6H3M9 3h6M15 3h2a4 4 0 0 1 4 4v2M15 3v6h6M15 21H9M9 21H7a4 4 0 0 1-4-4v-2M9 21v-6H3M15 21v-6h6M21 15v2a4 4 0 0 1-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
