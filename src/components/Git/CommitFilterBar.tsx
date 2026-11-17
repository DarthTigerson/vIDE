import { useEffect, useMemo, useRef, useState } from 'react'
import type { GitCommit } from '@/types/index'
import type { CommitFilters } from './commitFilter'
import { distinctAuthors, distinctBranches, distinctTags } from './commitFilter'

function MultiSelectDropdown({ label, options, selected, onChange }: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.toLowerCase().includes(needle))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={options.length === 0}
        className={[
          'h-7 rounded-sm border px-2 text-xs flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          selected.length > 0
            ? 'border-[#2563eb]/70 bg-[#2563eb]/15 text-fg'
            : 'border-border bg-bg text-fg-muted hover:border-fg-subtle',
        ].join(' ')}
      >
        {label}
        {selected.length > 0 && <span className="text-[0.625rem] text-[var(--ref-blue-text)]">{selected.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-2xl shadow-black/40">
          <div className="border-b border-border p-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder={`Filter ${label.toLowerCase()}`}
              className="w-full h-7 rounded-sm border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-hidden focus:ring-1 focus:ring-[#2563eb]/70"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-fg-subtle">No matches</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggle(option)}
                  className={[
                    'w-full min-w-0 rounded-sm px-2 py-1.5 text-left flex items-center gap-2 transition-colors text-xs',
                    selected.includes(option) ? 'bg-[#2563eb]/18 text-fg' : 'hover:bg-white/[0.06] text-fg-muted',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'shrink-0 h-3 w-3 rounded-xs border flex items-center justify-center',
                      selected.includes(option) ? 'border-[#2563eb] bg-[#2563eb]' : 'border-border',
                    ].join(' ')}
                  >
                    {selected.includes(option) && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option}</span>
                </button>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-t border-border px-2 py-1.5 text-left text-[0.625rem] text-fg-muted hover:text-fg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function CommitFilterBar({ commits, filters, onSearchTextChange, onBranchesChange, onTagsChange, onAuthorsChange }: {
  commits: GitCommit[]
  filters: CommitFilters
  onSearchTextChange: (text: string) => void
  onBranchesChange: (branches: string[]) => void
  onTagsChange: (tags: string[]) => void
  onAuthorsChange: (authors: string[]) => void
}) {
  const branchOptions = useMemo(() => distinctBranches(commits), [commits])
  const tagOptions = useMemo(() => distinctTags(commits), [commits])
  const authorOptions = useMemo(() => distinctAuthors(commits), [commits])

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border shrink-0">
      <input
        value={filters.searchText}
        onChange={(e) => onSearchTextChange(e.target.value)}
        placeholder="Search subject, hash, author, refs…"
        className="flex-1 h-7 rounded-sm border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-hidden focus:ring-1 focus:ring-[#2563eb]/70"
      />
      {/* relative + shared: each dropdown's popover anchors to this group's
          right edge (not its own button's), so Branch/Tag/Author all open
          flush with the far right regardless of which button triggered it. */}
      <div className="relative flex items-center gap-1.5">
        <MultiSelectDropdown label="Branch" options={branchOptions} selected={filters.branches} onChange={onBranchesChange} />
        <MultiSelectDropdown label="Tag" options={tagOptions} selected={filters.tags} onChange={onTagsChange} />
        <MultiSelectDropdown label="Author" options={authorOptions} selected={filters.authors} onChange={onAuthorsChange} />
      </div>
    </div>
  )
}
