import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { TODO_COLUMNS, TODO_SORT_MODES } from '@/lib/todoBoard'
import type { TodoSortDirection, TodoSortMode } from '@/lib/todoBoard'
import { TODO_PROJECT_SORT_MODES } from '@/lib/todoProjectSort'
import type { TodoProjectSortMode } from '@/lib/todoProjectSort'
import { TODO_LABELS, TODO_LABEL_META } from './labels'
import type { Todo, TodoLabel, TodoStatus } from '@/types/api'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { CheckableMenuButton, MenuButton, MenuDivider, SubMenuButton } from '@/components/ui/MenuItems'

function useMenuDismiss(onClose: () => void) {
  useEffect(() => {
    const close = () => onClose()
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])
}

function useClampedPosition(menuRef: React.RefObject<HTMLDivElement | null>, x: number, y: number) {
  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menuRef, x, y])
}

const STATUS_TITLES: Record<TodoStatus, string> = Object.fromEntries(
  TODO_COLUMNS.map((c) => [c.status, c.title])
) as Record<TodoStatus, string>

function SortSubmenuContent({
  sortMode,
  sortDirection,
  onSelectMode,
  onSelectDirection,
}: {
  sortMode: TodoSortMode
  sortDirection: TodoSortDirection
  onSelectMode: (mode: TodoSortMode) => void
  onSelectDirection: (direction: TodoSortDirection) => void
}) {
  return (
    <>
      <CheckableMenuButton checked={sortDirection === 'asc'} onClick={() => onSelectDirection('asc')}>
        Order
      </CheckableMenuButton>
      <CheckableMenuButton checked={sortDirection === 'desc'} onClick={() => onSelectDirection('desc')}>
        Reverse order
      </CheckableMenuButton>
      <MenuDivider />
      {TODO_SORT_MODES.map(({ mode, title }) => (
        <CheckableMenuButton key={mode} checked={sortMode === mode} onClick={() => onSelectMode(mode)}>
          {title}
        </CheckableMenuButton>
      ))}
    </>
  )
}

function SortSubmenus({
  columnSortMode,
  columnSortDirection,
  onSelectColumnMode,
  onSelectAllMode,
  onSelectColumnDirection,
  onSelectAllDirection,
}: {
  columnSortMode: TodoSortMode
  columnSortDirection: TodoSortDirection
  onSelectColumnMode: (mode: TodoSortMode) => void
  onSelectAllMode: (mode: TodoSortMode) => void
  onSelectColumnDirection: (direction: TodoSortDirection) => void
  onSelectAllDirection: (direction: TodoSortDirection) => void
}) {
  return (
    <>
      <SubMenuButton label="Sort by">
        <SortSubmenuContent
          sortMode={columnSortMode}
          sortDirection={columnSortDirection}
          onSelectMode={onSelectColumnMode}
          onSelectDirection={onSelectColumnDirection}
        />
      </SubMenuButton>
      <SubMenuButton label="Sort all by">
        <SortSubmenuContent
          sortMode={columnSortMode}
          sortDirection={columnSortDirection}
          onSelectMode={onSelectAllMode}
          onSelectDirection={onSelectAllDirection}
        />
      </SubMenuButton>
    </>
  )
}

export function TodoCardMenu({
  x,
  y,
  todo,
  columnSortMode,
  columnSortDirection,
  onClose,
  onDuplicate,
  onMoveTo,
  onSetLabel,
  onArchive,
  onSortColumnMode,
  onSortAllMode,
  onSortColumnDirection,
  onSortAllDirection,
  onArchiveAll,
}: {
  x: number
  y: number
  todo: Todo
  columnSortMode: TodoSortMode
  columnSortDirection: TodoSortDirection
  onClose: () => void
  onDuplicate: () => void
  onMoveTo: (status: TodoStatus) => void
  onSetLabel: (label: TodoLabel | null) => void
  onArchive: () => void
  onSortColumnMode: (mode: TodoSortMode) => void
  onSortAllMode: (mode: TodoSortMode) => void
  onSortColumnDirection: (direction: TodoSortDirection) => void
  onSortAllDirection: (direction: TodoSortDirection) => void
  onArchiveAll?: () => void
}) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)
  useMenuDismiss(onClose)
  useClampedPosition(menuRef, x, y)

  function withClose<Args extends unknown[]>(fn: (...args: Args) => void) {
    return (...args: Args) => {
      fn(...args)
      onClose()
    }
  }

  const moveTargets = TODO_COLUMNS.filter((c) => c.status !== todo.status)

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuButton onClick={withClose(onDuplicate)}>Duplicate</MenuButton>
      <MenuDivider />
      <SubMenuButton label="Move to">
        {moveTargets.map((c) => (
          <MenuButton key={c.status} onClick={withClose(() => onMoveTo(c.status))}>
            {STATUS_TITLES[c.status]}
          </MenuButton>
        ))}
        <MenuButton onClick={withClose(onArchive)}>Archive</MenuButton>
      </SubMenuButton>
      <SubMenuButton label="Label">
        <CheckableMenuButton checked={todo.label === null} onClick={withClose(() => onSetLabel(null))}>
          No label
        </CheckableMenuButton>
        {TODO_LABELS.map((label) => (
          <CheckableMenuButton
            key={label}
            checked={todo.label === label}
            onClick={withClose(() => onSetLabel(label))}
          >
            {TODO_LABEL_META[label].text}
          </CheckableMenuButton>
        ))}
      </SubMenuButton>
      <MenuDivider />
      <SortSubmenus
        columnSortMode={columnSortMode}
        columnSortDirection={columnSortDirection}
        onSelectColumnMode={withClose(onSortColumnMode)}
        onSelectAllMode={withClose(onSortAllMode)}
        onSelectColumnDirection={withClose(onSortColumnDirection)}
        onSelectAllDirection={withClose(onSortAllDirection)}
      />
      {onArchiveAll && (
        <>
          <MenuDivider />
          <MenuButton onClick={withClose(onArchiveAll)}>Archive All</MenuButton>
        </>
      )}
    </div>,
    document.body
  )
}

function ProjectSortSubmenu({
  projectSort,
  onSelect,
}: {
  projectSort: TodoProjectSortMode
  onSelect: (mode: TodoProjectSortMode) => void
}) {
  return (
    <SubMenuButton label="Sort by">
      {TODO_PROJECT_SORT_MODES.map(({ mode, title }) => (
        <CheckableMenuButton key={mode} checked={projectSort === mode} onClick={() => onSelect(mode)}>
          {title}
        </CheckableMenuButton>
      ))}
    </SubMenuButton>
  )
}

// Toggles which per-status counts show beside each project. Clicking an item
// flips it without closing the menu, so several can be changed in one go.
function DisplaySubmenu({
  shownCounts,
  onToggle,
}: {
  shownCounts: TodoStatus[]
  onToggle: (status: TodoStatus) => void
}) {
  return (
    <SubMenuButton label="Display">
      {TODO_COLUMNS.map((c) => (
        <CheckableMenuButton key={c.status} checked={shownCounts.includes(c.status)} onClick={() => onToggle(c.status)}>
          {c.title}
        </CheckableMenuButton>
      ))}
    </SubMenuButton>
  )
}

// Right-click menu for the To Do sidebar. `project` is set when a project row
// was right-clicked (adds Rename / Move to Trash); on empty space it's just
// the sort options.
export function TodoProjectMenu({
  x,
  y,
  projectSort,
  shownCounts,
  onClose,
  onSortProjects,
  onToggleShownCount,
  onRename,
  onDelete,
}: {
  x: number
  y: number
  projectSort: TodoProjectSortMode
  shownCounts: TodoStatus[]
  onClose: () => void
  onSortProjects: (mode: TodoProjectSortMode) => void
  onToggleShownCount: (status: TodoStatus) => void
  onRename?: () => void
  onDelete?: () => void
}) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)
  useMenuDismiss(onClose)
  useClampedPosition(menuRef, x, y)

  function withClose<Args extends unknown[]>(fn: (...args: Args) => void) {
    return (...args: Args) => {
      fn(...args)
      onClose()
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-40 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {onRename && onDelete && (
        <>
          <MenuButton onClick={withClose(onRename)}>Rename</MenuButton>
          <MenuButton danger onClick={withClose(onDelete)}>
            Move to Trash
          </MenuButton>
          <MenuDivider />
        </>
      )}
      <ProjectSortSubmenu projectSort={projectSort} onSelect={withClose(onSortProjects)} />
      <DisplaySubmenu shownCounts={shownCounts} onToggle={onToggleShownCount} />
    </div>,
    document.body
  )
}

export function TodoSortMenu({
  x,
  y,
  columnSortMode,
  columnSortDirection,
  onClose,
  onSelectColumnMode,
  onSelectAllMode,
  onSelectColumnDirection,
  onSelectAllDirection,
  onArchiveAll,
}: {
  x: number
  y: number
  columnSortMode: TodoSortMode
  columnSortDirection: TodoSortDirection
  onClose: () => void
  onSelectColumnMode: (mode: TodoSortMode) => void
  onSelectAllMode: (mode: TodoSortMode) => void
  onSelectColumnDirection: (direction: TodoSortDirection) => void
  onSelectAllDirection: (direction: TodoSortDirection) => void
  onArchiveAll?: () => void
}) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)
  useMenuDismiss(onClose)
  useClampedPosition(menuRef, x, y)

  function withClose<Args extends unknown[]>(fn: (...args: Args) => void) {
    return (...args: Args) => {
      fn(...args)
      onClose()
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <SortSubmenus
        columnSortMode={columnSortMode}
        columnSortDirection={columnSortDirection}
        onSelectColumnMode={withClose(onSelectColumnMode)}
        onSelectAllMode={withClose(onSelectAllMode)}
        onSelectColumnDirection={withClose(onSelectColumnDirection)}
        onSelectAllDirection={withClose(onSelectAllDirection)}
      />
      {onArchiveAll && (
        <>
          <MenuDivider />
          <MenuButton onClick={withClose(onArchiveAll)}>Archive All</MenuButton>
        </>
      )}
    </div>,
    document.body
  )
}

// Right-click menu for a project row in the To Do Trash tab.
export function TodoTrashMenu({
  x,
  y,
  onClose,
  onRestore,
}: {
  x: number
  y: number
  onClose: () => void
  onRestore: () => void
}) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)
  useMenuDismiss(onClose)
  useClampedPosition(menuRef, x, y)

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-40 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuButton
        onClick={() => {
          onRestore()
          onClose()
        }}
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path
              d="M4 12a8 8 0 1 0 2.34-5.66L4 8.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M4 4v4.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Restore
        </span>
      </MenuButton>
    </div>,
    document.body
  )
}
