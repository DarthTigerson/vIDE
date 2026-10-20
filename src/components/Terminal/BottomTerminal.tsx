import { Fragment, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { useScriptsStore } from '@/stores/scriptsStore'
import { TerminalTab } from './TerminalTab'
import { BottomTerminalTabMenu } from './BottomTerminalTabMenu'

const DRAG_TYPE = 'application/x-vide-bottom-terminal'
// Same edge share as the editor's pane drop zones (Editor/dropZone.ts).
const EDGE_FRACTION = 0.25

type DropTarget =
  | { kind: 'tab'; side: number; beforeId: string; placement: 'before' | 'after' }
  | { kind: 'strip'; side: number }
  | { kind: 'body'; side: number; zone: 'center' | 'left' | 'right' }

interface Drag {
  dragged: string | null
  dropTarget: DropTarget | null
  start: (id: string) => void
  over: (target: DropTarget | null) => void
  // Applies the current drop target to `id`, then ends the drag.
  drop: (id: string) => void
  clear: () => void
}

const BODY_HIGHLIGHT: Record<'center' | 'left' | 'right', string> = {
  center: 'inset-0',
  left: 'inset-y-0 left-0 w-1/2',
  right: 'inset-y-0 right-0 w-1/2',
}

// The panel under the editor while the bottom terminal is on (mockup "B"):
// one or two sides, left and right, each with its own tab strip. Tabs drag
// to reorder, onto the other side's strip or terminal to move there, or onto
// a lone side's left/right edge to split; the split button at the end of the
// last strip splits (one side) or merges (two).
export function BottomTerminal() {
  const sides = useBottomTerminalStore((s) => s.sides)
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const drag: Drag = {
    dragged,
    dropTarget,
    start: (id) => setDragged(id),
    over: (target) => setDropTarget(target),
    drop: (id) => {
      const store = useBottomTerminalStore.getState()
      const target = dropTarget
      if (target?.kind === 'tab' && target.beforeId !== id) {
        const rest = (store.sides[target.side] ?? []).filter((x) => x !== id)
        const beforeId = target.placement === 'before'
          ? target.beforeId
          : (rest[rest.indexOf(target.beforeId) + 1] ?? null)
        store.moveTerminal(id, target.side, beforeId)
      } else if (target?.kind === 'strip') {
        store.moveTerminal(id, target.side, null)
      } else if (target?.kind === 'body') {
        if (target.zone === 'center') store.moveTerminal(id, target.side, null)
        else store.splitWith(id, target.zone === 'right' ? 'after' : 'before')
      }
      setDragged(null)
      setDropTarget(null)
    },
    clear: () => {
      setDragged(null)
      setDropTarget(null)
    },
  }

  return (
    <div className="h-full w-full bg-bg" data-testid="bottom-terminal">
      <PanelGroup id="bottom-terminal-sides" direction="horizontal">
        {sides.map((ids, side) => (
          <Fragment key={side}>
            {side > 0 && (
              <PanelResizeHandle className="w-px bg-border hover:bg-accent/60 transition-colors cursor-col-resize" />
            )}
            <Panel id={`bottom-terminal-side-${side}`} order={side} defaultSize={100 / sides.length} minSize={15}>
              <Side side={side} ids={ids} last={side === sides.length - 1} drag={drag} />
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    </div>
  )
}

function Side({ side, ids, last, drag }: { side: number; ids: string[]; last: boolean; drag: Drag }) {
  const activeId = useBottomTerminalStore((s) => s.active[side] ?? null)
  const focused = useBottomTerminalStore((s) => s.focusedSide === side)
  const split = useBottomTerminalStore((s) => s.sides.length > 1)
  const titles = useScriptsStore((s) => s.terminalTitles)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const store = useBottomTerminalStore.getState
  const target = drag.dropTarget?.side === side ? drag.dropTarget : null

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (id) drag.drop(id)
    else drag.clear()
  }

  function onBodyDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = bodyRef.current!.getBoundingClientRect()
    const fracX = (e.clientX - rect.left) / rect.width
    // A lone side with another tab to leave behind splits from its edges.
    const canSplit = !split && ids.length > 1
    const zone = canSplit && fracX <= EDGE_FRACTION ? 'left' : canSplit && fracX >= 1 - EDGE_FRACTION ? 'right' : 'center'
    drag.over({ kind: 'body', side, zone })
  }

  return (
    <div className="flex h-full flex-col" onMouseDown={() => store().setFocusedSide(side)}>
      <div className="flex shrink-0 select-none border-b border-border bg-tab-bar">
        <div
          className={`flex min-w-0 flex-1 overflow-x-auto ${target?.kind === 'strip' ? 'bg-accent/5' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE) || e.target !== e.currentTarget) return
            e.preventDefault()
            drag.over({ kind: 'strip', side })
          }}
          onDrop={onDrop}
        >
          {ids.map((id) => {
            const name = titles[id] ?? 'Terminal'
            const isActive = id === activeId
            const isDropTarget = target?.kind === 'tab' && target.beforeId === id && drag.dragged !== id
            return (
              <div
                key={id}
                draggable
                data-testid="bottom-terminal-tab"
                className={`relative flex cursor-grab items-center gap-1.5 whitespace-nowrap border-r border-border px-3 py-1.5 text-sm ${
                  isActive
                    ? `-mt-px border-t-2 bg-panel text-fg ${focused ? 'border-t-accent' : 'border-t-fg-subtle'}`
                    : 'text-fg-muted hover:bg-white/5 hover:text-fg'
                } ${drag.dragged === id ? 'opacity-45' : ''}`}
                onClick={() => store().setActive(side, id)}
                onAuxClick={(e) => { if (e.button === 1) store().closeTerminal(id) }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, id })
                }}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData(DRAG_TYPE, id)
                  drag.start(id)
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                  e.preventDefault()
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  drag.over({ kind: 'tab', side, beforeId: id, placement: e.clientX < rect.left + rect.width / 2 ? 'before' : 'after' })
                }}
                onDrop={onDrop}
                onDragEnd={drag.clear}
              >
                {isDropTarget && (
                  <span
                    className={`absolute bottom-1 top-1 w-0.5 rounded-full bg-accent ${target.placement === 'before' ? 'left-0' : 'right-0'}`}
                  />
                )}
                <TerminalGlyph />
                <span>{name}</span>
                <button
                  type="button"
                  draggable={false}
                  aria-label={`Close ${name}`}
                  className="ml-1 text-base leading-none text-fg-subtle hover:text-fg"
                  onClick={(e) => {
                    e.stopPropagation()
                    store().closeTerminal(id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
          <button
            type="button"
            aria-label="New terminal"
            title="New terminal"
            className="flex w-7 shrink-0 items-center justify-center text-base leading-none text-fg-muted hover:text-fg"
            onClick={() => store().newTerminal(side)}
          >
            +
          </button>
        </div>
        {last && (
          <button
            type="button"
            aria-label={split ? 'Merge sides' : 'Split right'}
            title={split ? 'Merge sides' : 'Split right'}
            className={`flex w-8 shrink-0 items-center justify-center transition-colors ${split ? 'text-accent' : 'text-fg-muted hover:text-fg'}`}
            onClick={() => (split ? store().unsplit() : store().split())}
          >
            <SplitGlyph />
          </button>
        )}
      </div>
      <div ref={bodyRef} className="relative min-h-0 flex-1">
        {activeId ? (
          <TerminalTab key={activeId} terminalId={activeId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-fg-muted">
            <span>No terminals</span>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-fg transition-colors hover:border-fg-subtle"
              onClick={() => store().newTerminal(side)}
            >
              New terminal
            </button>
          </div>
        )}
        {/* Over the terminal only while a tab is dragged, like the editor's
            PaneDropZoneOverlay: xterm would otherwise swallow the drop. */}
        <div
          data-testid="bottom-terminal-drop-zone"
          className={`absolute inset-0 z-20 ${drag.dragged ? 'pointer-events-auto' : 'pointer-events-none'}`}
          onDragOver={onBodyDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && target?.kind === 'body') drag.over(null)
          }}
          onDrop={onDrop}
        >
          {target?.kind === 'body' && (
            <div className={`absolute rounded border-2 border-accent bg-accent/20 transition-all ${BODY_HIGHLIGHT[target.zone]}`} />
          )}
        </div>
      </div>
      {menu && <BottomTerminalTabMenu x={menu.x} y={menu.y} id={menu.id} onClose={() => setMenu(null)} />}
    </div>
  )
}

function TerminalGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M3 4.5 7 8l-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SplitGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
