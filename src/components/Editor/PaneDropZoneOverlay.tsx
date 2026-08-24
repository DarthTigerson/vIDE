import { useRef, useState } from 'react'
import { useEditorStore, type EditorSplitDirection, type SplitPlacement } from '@/stores/editorStore'
import { useTabDragStore } from '@/stores/tabDragStore'
import { computeDropZone, type DropZone } from './dropZone'

const SPLIT_FOR_ZONE: Record<Exclude<DropZone, 'center'>, { direction: EditorSplitDirection; placement: SplitPlacement }> = {
  left: { direction: 'horizontal', placement: 'before' },
  right: { direction: 'horizontal', placement: 'after' },
  up: { direction: 'vertical', placement: 'before' },
  down: { direction: 'vertical', placement: 'after' },
}

const HIGHLIGHT_CLASS_FOR_ZONE: Record<DropZone, string> = {
  center: 'inset-0',
  left: 'inset-y-0 left-0 w-1/2',
  right: 'inset-y-0 right-0 w-1/2',
  up: 'inset-x-0 top-0 h-1/2',
  down: 'inset-x-0 bottom-0 h-1/2',
}

// Sits over a pane's content area (below its tab strip) so a tab drag that
// misses the tab strip lands here instead of falling through to whatever's
// underneath (Monaco pastes the dragged path as text otherwise). Always
// mounted, toggling pointer-events so it's inert - and invisible to native
// drag targeting - except during an actual tab drag; that sidesteps any
// mount-timing race with the drag already being mid-flight by the time a
// drag-in-progress condition would first render it.
export function PaneDropZoneOverlay({ paneId }: { paneId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zone, setZone] = useState<DropZone | null>(null)
  const dragging = useTabDragStore((s) => s.dragging)
  const moveTabBetweenPanes = useEditorStore((s) => s.moveTabBetweenPanes)
  const splitPaneWithIncomingTab = useEditorStore((s) => s.splitPaneWithIncomingTab)

  const endDrag = useTabDragStore((s) => s.endDrag)

  const isDragActive = dragging !== null

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!dragging || !e.dataTransfer.types.includes('application/x-vide-pane')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = containerRef.current!.getBoundingClientRect()
    setZone(computeDropZone(rect, e.clientX, e.clientY))
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setZone(null)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const current = dragging
    setZone(null)
    // Cleared here rather than left to the dragged tab's own onDragEnd: moving/
    // splitting below can remove that tab's DOM node from its source pane in
    // this same tick, and a source node removed before the browser dispatches
    // dragend on it means dragend may never fire - which would leave `dragging`
    // stuck non-null and every pane's overlay permanently pointer-events-auto.
    endDrag()
    if (!current || !zone) return

    if (zone === 'center') {
      if (current.sourcePaneId !== paneId) moveTabBetweenPanes(current.sourcePaneId, paneId, current.path)
      return
    }
    const { direction, placement } = SPLIT_FOR_ZONE[zone]
    splitPaneWithIncomingTab(paneId, current.sourcePaneId, current.path, direction, placement)
  }

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-20 ${isDragActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {zone && (
        <div className={`absolute rounded border-2 border-accent bg-accent/20 transition-all ${HIGHLIGHT_CLASS_FOR_ZONE[zone]}`} />
      )}
    </div>
  )
}
