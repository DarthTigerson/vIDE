import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useGitStore } from '@/stores/gitStore'
import { useGitBranchStore, useRepoBranchState } from '@/stores/gitBranchStore'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { useRestoreFocus } from '@/lib/useRestoreFocus'

interface Props {
  projectRoot: string
  onClose: () => void
}

type PaletteItem =
  | { kind: 'local'; label: string; current: boolean }
  | { kind: 'remote'; label: string; ref: string }
  | { kind: 'create'; label: string }

export function BranchPalette({ projectRoot, onClose }: Props) {
  useCoverNativeViews()
  useRestoreFocus()
  const { current, local, remote, loading } = useRepoBranchState(projectRoot)
  const load = useGitBranchStore((s) => s.load)
  const checkout = useGitStore((s) => s.checkout)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load(projectRoot)
  }, [projectRoot, load])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const q = query.trim().toLowerCase()

  const items = useMemo((): PaletteItem[] => {
    const localItems: PaletteItem[] = local
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name) => ({ kind: 'local', label: name, current: name === current }))
    const remoteItems: { label: string; ref: string }[] = remote
      .filter((ref) => !q || ref.toLowerCase().includes(q))
      .map((ref) => ({ ref, label: ref.slice(ref.indexOf('/') + 1) }))
    const trimmed = query.trim()
    const exactMatch =
      trimmed !== '' && (local.includes(trimmed) || remoteItems.some((r) => r.label === trimmed))
    const createItems: PaletteItem[] =
      trimmed !== '' && !exactMatch ? [{ kind: 'create', label: trimmed }] : []
    return [
      ...localItems,
      ...remoteItems.map((r): PaletteItem => ({ kind: 'remote', label: r.label, ref: r.ref })),
      ...createItems,
    ]
  }, [local, remote, current, q, query])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function select(item: PaletteItem) {
    if (item.kind === 'local') {
      if (!item.current) checkout(projectRoot, { ref: item.label, create: false })
    } else if (item.kind === 'remote') {
      checkout(projectRoot, { ref: item.label, create: true, track: item.ref })
    } else {
      checkout(projectRoot, { ref: item.label, create: true })
    }
    onClose()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) select(item)
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
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search branches, or type a new name…"
          className="w-full bg-transparent px-4 py-3 border-b border-border text-sm text-fg placeholder:text-fg-subtle outline-none"
        />
        <div ref={listRef} className="overflow-y-auto flex-1 py-1">
          {loading && (
            <div className="px-4 py-6 text-sm text-fg-subtle text-center">Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-6 text-sm text-fg-subtle text-center">
              No branches matching "{query}"
            </div>
          )}
          {!loading &&
            items.map((item, i) => {
              const showLabel = item.kind !== items[i - 1]?.kind
              return (
                <div key={`${item.kind}-${item.label}`}>
                  {showLabel && item.kind !== 'create' && (
                    <div className="px-4 pt-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
                      {item.kind === 'local' ? 'Local' : 'Remote'}
                    </div>
                  )}
                  {showLabel && item.kind === 'create' && (
                    <div className="mt-1 border-t border-border" />
                  )}
                  <button
                    type="button"
                    onMouseDown={() => select(item)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={[
                      'w-full flex items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors',
                      i === activeIndex ? 'bg-accent/20' : 'hover:bg-white/5',
                      item.kind === 'create' ? 'text-green-400' : 'text-fg-muted',
                    ].join(' ')}
                  >
                    <span className={item.kind === 'local' && item.current ? 'text-accent' : ''}>
                      {item.kind === 'create' ? `+ Create branch "${item.label}"` : item.label}
                    </span>
                    {item.kind === 'local' && item.current && (
                      <span className="ml-auto text-[0.625rem] text-fg-subtle">current</span>
                    )}
                    {item.kind === 'remote' && (
                      <span className="ml-auto text-[0.625rem] text-fg-subtle">checkout</span>
                    )}
                  </button>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
