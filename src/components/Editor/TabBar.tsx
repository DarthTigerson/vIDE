import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useBrowserStore } from '@/stores/browserStore'
import { useTodoStore } from '@/stores/todoStore'
import { useScriptsStore } from '@/stores/scriptsStore'
import { scriptDisplayTitle } from '@/lib/scriptBody'
import { useNotesStore } from '@/stores/notesStore'
import { FileIcon, BrowserTabIcon } from '@/components/Sidebar/FileIcon'
import { isTerminalTab, getTerminalId, isBrowserTab, getBrowserId, isTodoBoardTab, getTodoBoardProjectId, isTodoDetailTab, getTodoDetailIds, isLlamaModelTab, getLlamaModelId, isScriptTab, getScriptId } from '@/components/Settings/paths'
import { useLlamaModelsStore } from '@/stores/llamaModelsStore'
import { isCompactTabStrip, orderTabsForDisplay, truncateTabLabel } from './tabDisplay'
import { TabContextMenu } from './TabContextMenu'
import { TabTooltip } from './TabTooltip'
import { useTabContextMenuStore } from '@/stores/tabContextMenuStore'
import { useTabDragStore } from '@/stores/tabDragStore'
import { isScratchTab } from './paths'
import { requestCloseTab } from '@/stores/discardScratchStore'

export function TabBar({ paneId }: { paneId: string }) {
  const tabs = useEditorStore((s) => s.tabs)
  const browserTabs = useBrowserStore((s) => s.tabs)
  const todoProjects = useTodoStore((s) => s.projects)
  const todosByProject = useTodoStore((s) => s.todosByProject)
  const scriptTerminalTitles = useScriptsStore((s) => s.terminalTitles)
  const scripts = useScriptsStore((s) => s.scripts)
  const notesRoot = useNotesStore((s) => s.root)
  const llamaModels = useLlamaModelsStore((s) => s.models)
  const paneTabs = useEditorStore((s) => s.paneTabs)
  const paneTabLists = useEditorStore((s) => s.paneTabLists)
  const pinnedPaths = useEditorStore((s) => s.pinnedPaths)
  const openScratchTab = useEditorStore((s) => s.openScratchTab)
  const moveTabWithinPane = useEditorStore((s) => s.moveTabWithinPane)
  const moveTabBetweenPanes = useEditorStore((s) => s.moveTabBetweenPanes)
  const setPaneActive = useEditorStore((s) => s.setPaneActive)

  const activePath = paneTabs[paneId] ?? null
  const paneTabPaths = orderTabsForDisplay(paneTabLists[paneId] ?? [], pinnedPaths)
  const paneTabs_ = paneTabPaths
    .map((path) => tabs.find((t) => t.path === path))
    .filter((t): t is (typeof tabs)[number] => t !== undefined)

  const dragging = useTabDragStore((s) => s.dragging)
  const startDrag = useTabDragStore((s) => s.startDrag)
  const endDrag = useTabDragStore((s) => s.endDrag)
  const draggedPath = dragging?.path ?? null
  const [dropTarget, setDropTarget] = useState<{
    path: string
    placement: 'before' | 'after'
  } | null>(null)
  const openContextMenu = useTabContextMenuStore((s) => s.open)
  const openTabContextMenu = useTabContextMenuStore((s) => s.openMenu)
  const closeTabContextMenu = useTabContextMenuStore((s) => s.closeMenu)
  // The strip's own width (not the tabs'), so collapsing tabs to icons can't
  // change the measurement that decided it.
  const [stripWidth, setStripWidth] = useState(0)
  const stripObserverRef = useRef<ResizeObserver | null>(null)
  const stripRef = useCallback((el: HTMLDivElement | null) => {
    stripObserverRef.current?.disconnect()
    stripObserverRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setStripWidth(entry.contentRect.width))
    observer.observe(el)
    stripObserverRef.current = observer
  }, [])
  // Full name on hover, only when the tab can't show it itself (icon-only, or
  // the label is truncated). After a short delay, like a native tooltip.
  const [hoverTip, setHoverTip] = useState<{ label: string; anchor: DOMRect } | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHoverTip = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
    setHoverTip(null)
  }, [])
  useEffect(() => clearHoverTip, [clearHoverTip])
  const contextMenu =
    openContextMenu?.paneId === paneId
      ? { x: openContextMenu.x, y: openContextMenu.y, path: openContextMenu.path }
      : null

  if (paneTabs_.length === 0) return null
  const compact = isCompactTabStrip(stripWidth, paneTabs_.length)

  function getDropPlacement(e: React.DragEvent<HTMLElement>): 'before' | 'after' {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
  }

  function clearDragState() {
    endDrag()
    setDropTarget(null)
  }

  return (
    <div className="flex bg-tab-bar border-b border-border shrink-0 select-none">
      <div
        ref={stripRef}
        className="flex flex-1 min-w-0 overflow-x-auto"
        // Empty strip only — e.target is the container itself just for the gap
        // to the right of the last tab. Double-clicking a tab (or its close
        // button) bubbles up here too and must not spawn a file.
        onDoubleClick={(e) => { if (e.target === e.currentTarget) openScratchTab(paneId) }}
      >
      {paneTabs_.map((tab) => {
        const name = isScratchTab(tab.path)
          ? 'Untitled'
          : isTerminalTab(tab.path)
          ? (scriptTerminalTitles[getTerminalId(tab.path)] ?? 'Terminal')
          : isBrowserTab(tab.path)
            ? (browserTabs[getBrowserId(tab.path)]?.title || 'New Tab')
            : isLlamaModelTab(tab.path)
              ? (() => {
                  const id = getLlamaModelId(tab.path)
                  if (id === 'new') return 'New Model'
                  const model = llamaModels.find((m) => m.id === id)
                  return model ? (model.displayName || model.alias || 'Model') : 'Model'
                })()
            : isScriptTab(tab.path)
              ? (() => {
                  const script = scripts.find((s) => s.id === getScriptId(tab.path))
                  return script ? scriptDisplayTitle(script) : 'Script'
                })()
            : isTodoBoardTab(tab.path)
              ? (todoProjects.find((p) => p.id === getTodoBoardProjectId(tab.path))?.name || 'To Do')
              : isTodoDetailTab(tab.path)
                ? (() => {
                    const { projectId, todoId } = getTodoDetailIds(tab.path)
                    return todosByProject[projectId]?.find((t) => t.id === todoId)?.title || 'To Do'
                  })()
                : (() => {
                    const base = tab.path.split('/').pop() ?? tab.path
                    const inNotesRoot = !!notesRoot && tab.path.startsWith(notesRoot + '/')
                    return inNotesRoot && base.endsWith('.md') ? base.slice(0, -3) : base
                  })()
        const isActive = activePath === tab.path
        const isDragging = draggedPath === tab.path
        const isDropTarget = dropTarget?.path === tab.path && draggedPath !== tab.path
        const isPinned = pinnedPaths.has(tab.path)
        const displayName = isPinned ? truncateTabLabel(name) : name
        const isBrowser = isBrowserTab(tab.path)
        const iconOnly = compact && !isActive
        return (
          <div
            key={tab.path}
            draggable
            // Every tab sizes to its name up to a max width; once the strip is
            // full they all shrink (longest the most) down to a min width, and
            // only then does the strip scroll. The name truncates with an
            // ellipsis and the full name is on hover. With too many tabs for
            // any name to be readable, inactive tabs shrink to just their icon.
            onMouseEnter={(e) => {
              const tabEl = e.currentTarget
              clearHoverTip()
              hoverTimerRef.current = setTimeout(() => {
                const labelEl = tabEl.querySelector<HTMLElement>('[data-tab-label]')
                const truncated = !!labelEl && labelEl.scrollWidth > labelEl.clientWidth
                if (iconOnly || truncated) {
                  setHoverTip({ label: name, anchor: tabEl.getBoundingClientRect() })
                }
              }, 500)
            }}
            onMouseLeave={clearHoverTip}
            onMouseDown={clearHoverTip}
            className={`relative flex shrink items-center gap-1.5 px-3 py-1.5 border-r border-border whitespace-nowrap text-sm max-w-[220px] ${
              iconOnly ? 'min-w-[2.75rem]' : 'min-w-[4.5rem]'
            } ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            } ${
              isActive
                ? 'bg-panel text-fg border-t-2 border-t-accent -mt-px'
                : 'text-fg-muted hover:text-fg hover:bg-white/5'
            } ${isDragging ? 'opacity-45' : ''}`}
            onClick={() => {
              setPaneActive(paneId, tab.path)
              // Re-asserts the tab's repo as current even when this tab was
              // already active (App.tsx's activeTabPath-change effect can't
              // catch that case — Zustand skips notifying subscribers when a
              // selector's value doesn't change, so re-clicking an
              // already-active tab never fires it). Without this, clicking a
              // different repo's action button in the Git panel could leave
              // the footer/selectedRepo "stuck" on that repo even after
              // returning to an editor tab from a different one.
              useGitReposStore.getState().followFilePath(tab.path)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              openTabContextMenu(paneId, tab.path, e.clientX, e.clientY)
            }}
            onDragStart={(e) => {
              clearHoverTip()
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', tab.path)
              e.dataTransfer.setData('application/x-vide-pane', paneId)
              startDrag(tab.path, paneId)
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('text/plain')) return
              if (draggedPath === tab.path) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropTarget({ path: tab.path, placement: getDropPlacement(e) })
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDropTarget((target) => (target?.path === tab.path ? null : target))
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              const sourcePath = e.dataTransfer.getData('text/plain')
              const sourcePaneId = e.dataTransfer.getData('application/x-vide-pane')
              const placement =
                dropTarget?.path === tab.path ? dropTarget.placement : getDropPlacement(e)
              if (sourcePath && sourcePath !== tab.path) {
                if (sourcePaneId !== paneId) {
                  moveTabBetweenPanes(sourcePaneId, paneId, sourcePath)
                } else {
                  moveTabWithinPane(paneId, sourcePath, tab.path, placement)
                }
              }
              clearDragState()
            }}
            onDragEnd={clearDragState}
          >
            {isDropTarget && (
              <span
                className={[
                  'absolute top-1 bottom-1 w-0.5 rounded-full bg-accent',
                  dropTarget.placement === 'before' ? 'left-0' : 'right-0',
                ].join(' ')}
              />
            )}
            {isBrowser ? <BrowserTabIcon /> : <FileIcon name={name} />}
            <span data-tab-label className={`min-w-0 truncate ${iconOnly ? 'hidden' : ''}`}>
              {displayName}
            </span>
            {tab.missing && !iconOnly && (
              <span
                title="File no longer exists on disk. Press Cmd+S to save it again."
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-amber-400/70 text-[0.625rem] font-bold leading-none text-amber-300"
              >
                !
              </span>
            )}
            {tab.dirty && !iconOnly && (
              <span className="shrink-0 text-accent" title="Unsaved changes">
                ●
              </span>
            )}
            <button
              type="button"
              draggable={false}
              aria-label={`Close ${name}`}
              className={`text-fg-subtle hover:text-fg text-base leading-none ml-1 shrink-0 ${iconOnly ? 'hidden' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                requestCloseTab(paneId, tab.path)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      {/* Same as the bottom terminal panel's "+": a new blank file, like
          double-clicking the empty strip. */}
      <button
        type="button"
        aria-label="New file"
        title="New file"
        className="flex w-7 shrink-0 items-center justify-center text-base leading-none text-fg-muted hover:text-fg"
        onClick={() => openScratchTab(paneId)}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        +
      </button>
      </div>
      {/* Outside the scrolling list on purpose: padding on the list itself
          scrolls away once tabs overflow, which is exactly when there is no
          empty strip left to double-click. */}
      <div
        className="w-4 shrink-0"
        title="Double-click for a new file"
        onDoubleClick={() => openScratchTab(paneId)}
      />
      {hoverTip && !contextMenu && <TabTooltip label={hoverTip.label} anchor={hoverTip.anchor} />}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          paneId={paneId}
          path={contextMenu.path}
          onClose={closeTabContextMenu}
          onRequestClose={(path) => requestCloseTab(paneId, path)}
        />
      )}
    </div>
  )
}
