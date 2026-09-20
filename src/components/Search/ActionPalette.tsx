import { useEffect, useRef, useState } from 'react'
import { getAllCommands } from './commandRegistry'
import type { Command } from './commands'
import { ShortcutKeys } from '@/components/ui/ShortcutKeys'

interface Props {
  onClose: () => void
}

function filterCommands(query: string): Command[] {
  const all = getAllCommands()
  const visible = all.filter((cmd) => cmd.condition === undefined || cmd.condition())
  if (!query.trim()) return visible

  const q = query.toLowerCase()
  return visible.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(q)) return true
    if (cmd.description?.toLowerCase().includes(q)) return true
    if (cmd.keywords?.some((k) => k.toLowerCase().includes(q))) return true
    return false
  })
}

export function ActionPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = filterCommands(query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function execute(cmd: Command) {
    onClose()
    cmd.action?.()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = commands[activeIndex]
      if (cmd) execute(cmd)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

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
            placeholder="Run a command…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-fg-subtle hover:text-fg transition-colors">
              <ClearIcon />
            </button>
          )}
        </div>

        {commands.length > 0 && (
          <ul ref={listRef} className="overflow-y-auto flex-1 py-1">
            {commands.map((cmd, i) => {
              const isActive = i === activeIndex
              return (
                <li key={cmd.id}>
                  <button
                    type="button"
                    onMouseDown={() => execute(cmd)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      isActive ? 'bg-accent/20' : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={['text-sm font-medium', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                        {cmd.label}
                      </div>
                      {cmd.description && (
                        <div className="text-xs text-fg-subtle truncate">{cmd.description}</div>
                      )}
                    </div>
                    {cmd.shortcut && <ShortcutKeys shortcut={cmd.shortcut} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {commands.length === 0 && (
          <div className="px-4 py-6 text-sm text-fg-subtle text-center">No commands matching "{query}"</div>
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
