import { useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'
import { useTodoStore } from '@/stores/todoStore'
import { FileIcon } from '@/components/Sidebar/FileIcon'
import { isTerminalTab, isBrowserTab, getBrowserId, isTodoBoardTab, getTodoBoardProjectId, isTodoDetailTab, getTodoDetailIds } from '@/components/Settings/paths'
import { orderTabsForDisplay, truncateTabLabel } from './tabDisplay'
import { TabContextMenu } from './TabContextMenu'
import { useTabContextMenuStore } from '@/stores/tabContextMenuStore'
import { useTabDragStore } from '@/stores/tabDragStore'

export function TabBar({ paneId }: { paneId: string }) {
  const tabs = useEditorStore((s) => s.tabs)
  const browserTabs = useBrowserStore((s) => s.tabs)
  const todoProjects = useTodoStore((s) => s.projects)
  const todosByProject = useTodoStore((s) => s.todosByProject)
  const paneTabs = useEditorStore((s) => s.paneTabs)
  const paneTabLists = useEditorStore((s) => s.paneTabLists)
  const pinnedPaths = useEditorStore((s) => s.pinnedPaths)
  const closeTabInPane = useEditorStore((s) => s.closeTabInPane)
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
  const contextMenu =
    openContextMenu?.paneId === paneId
      ? { x: openContextMenu.x, y: openContextMenu.y, path: openContextMenu.path }
      : null

  if (paneTabs_.length === 0) return null

  function getDropPlacement(e: React.DragEvent<HTMLElement>): 'before' | 'after' {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
  }

  function clearDragState() {
    endDrag()
    setDropTarget(null)
  }

  return (
    <div className="flex bg-tab-bar border-b border-border overflow-x-auto shrink-0 select-none">
      {paneTabs_.map((tab) => {
        const name = isTerminalTab(tab.path)
          ? 'Terminal'
          : isBrowserTab(tab.path)
            ? (browserTabs[getBrowserId(tab.path)]?.title || 'New Tab')
            : isTodoBoardTab(tab.path)
              ? (todoProjects.find((p) => p.id === getTodoBoardProjectId(tab.path))?.name || 'To Do')
              : isTodoDetailTab(tab.path)
                ? (() => {
                    const { projectId, todoId } = getTodoDetailIds(tab.path)
                    return todosByProject[projectId]?.find((t) => t.id === todoId)?.title || 'To Do'
                  })()
                : (tab.path.split('/').pop() ?? tab.path)
        const isActive = activePath === tab.path
        const isDragging = draggedPath === tab.path
        const isDropTarget = dropTarget?.path === tab.path && draggedPath !== tab.path
        const isPinned = pinnedPaths.has(tab.path)
        const displayName = isPinned ? truncateTabLabel(name) : name
        return (
          <div
            key={tab.path}
            draggable
            className={`relative flex items-center gap-1.5 px-3 py-1.5 border-r border-border whitespace-nowrap text-sm ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            } ${
              isActive
                ? 'bg-panel text-fg border-t-2 border-t-accent -mt-px'
                : 'text-fg-muted hover:text-fg hover:bg-white/5'
            } ${isDragging ? 'opacity-45' : ''}`}
            onClick={() => setPaneActive(paneId, tab.path)}
            onContextMenu={(e) => {
              e.preventDefault()
              openTabContextMenu(paneId, tab.path, e.clientX, e.clientY)
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', tab.path)
              e.dataTransfer.setData('application/x-huginn-pane', paneId)
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
              const sourcePaneId = e.dataTransfer.getData('application/x-huginn-pane')
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
            <FileIcon name={name} />
            <span>{displayName}</span>
            {tab.missing && (
              <span
                title="File no longer exists on disk. Press Cmd+S to save it again."
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-amber-400/70 text-[0.625rem] font-bold leading-none text-amber-300"
              >
                !
              </span>
            )}
            {tab.dirty && (
              <span className="text-accent" title="Unsaved changes">
                ●
              </span>
            )}
            <button
              type="button"
              draggable={false}
              aria-label={`Close ${name}`}
              className="text-fg-subtle hover:text-fg text-base leading-none ml-1"
              onClick={(e) => {
                e.stopPropagation()
                closeTabInPane(paneId, tab.path)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          paneId={paneId}
          path={contextMenu.path}
          onClose={closeTabContextMenu}
        />
      )}
    </div>
  )
}
