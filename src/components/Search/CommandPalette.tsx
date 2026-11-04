import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { openFile as openFileByRoute } from '@/lib/openFile'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

interface Props {
  projectRoot: string
  onClose: () => void
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

function relativePath(root: string, p: string): string {
  return p.startsWith(root + '/') ? p.slice(root.length + 1) : p
}

function scoreMatch(query: string, filePath: string): number {
  const name = basename(filePath).toLowerCase()
  const q = query.toLowerCase()
  if (name === q) return 3
  if (name.startsWith(q)) return 2
  if (name.includes(q)) return 1
  return 0
}

export function CommandPalette({ projectRoot, onClose }: Props) {
  useCoverNativeViews()
  const [query, setQuery] = useState('')
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    window.api.listAllFiles(projectRoot).then(setAllFiles)
    inputRef.current?.focus()
  }, [projectRoot])

  const filtered = query.trim()
    ? allFiles
        .filter((f) => basename(f).toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => scoreMatch(query, b) - scoreMatch(query, a))
        .slice(0, 100)
    : []

  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  async function openFile(path: string) {
    await openFileByRoute(path)
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filtered[activeIndex]
      if (selected) openFile(selected)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[620px] max-h-[60vh] flex flex-col bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Go to file…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-fg-subtle hover:text-fg transition-colors">
              <ClearIcon />
            </button>
          )}
        </div>

        {filtered.length > 0 && (
          <ul ref={listRef} className="overflow-y-auto flex-1 py-1">
            {filtered.map((file, i) => {
              const name = basename(file)
              const rel = relativePath(projectRoot, file)
              const isActive = i === activeIndex
              return (
                <li key={file}>
                  <button
                    type="button"
                    onMouseDown={() => openFile(file)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={[
                      'w-full flex flex-col px-4 py-2 text-left transition-colors',
                      isActive ? 'bg-accent/20' : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <span className={['text-sm font-medium', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                      {name}
                    </span>
                    <span className="text-xs text-fg-subtle truncate">{rel}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {query.trim() && filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-fg-subtle text-center">No files matching "{query}"</div>
        )}

        {!query.trim() && (
          <div className="px-4 py-6 text-sm text-fg-subtle text-center">Start typing to search files</div>
        )}
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-fg-subtle shrink-0">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
