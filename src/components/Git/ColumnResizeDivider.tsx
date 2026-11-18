import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface Props {
  width: number
  min: number
  max: number
  // Fires continuously while dragging, for live visual feedback.
  onResize: (width: number) => void
  // Fires once at drag end, for the caller to persist the final value.
  onCommit: (width: number) => void
}

// Shared by GitGraphPage and GitBranchDiffPage: a full-height draggable bar
// sitting at the boundary between the refs (tags) column and the pipes
// (graph) column, letting the user resize how much space each gets. Renders
// once per page (not per row) — every row shares the same column boundary,
// so one divider governs them all. Styled to match the app's existing
// react-resizable-panels dividers (see Separator in App.tsx).
export function ColumnResizeDivider({ width, min, max, onResize, onCommit }: Props) {
  const dragStart = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  function clamp(v: number): number {
    return Math.min(max, Math.max(min, v))
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    dragStart.current = { x: e.clientX, width }
    setDragging(true)
    // jsdom (component tests) doesn't implement the Pointer Capture API.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    onResize(clamp(dragStart.current.width + (e.clientX - dragStart.current.x)))
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    const next = clamp(dragStart.current.width + (e.clientX - dragStart.current.x))
    dragStart.current = null
    setDragging(false)
    onCommit(next)
  }

  return (
    <div
      className="absolute top-0 bottom-0 z-20 w-2.5 -translate-x-1/2 cursor-col-resize touch-none"
      style={{ left: width }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className={[
          'mx-auto h-full w-px transition-colors',
          dragging ? 'bg-accent' : 'bg-border hover:bg-accent/60',
        ].join(' ')}
      />
    </div>
  )
}
