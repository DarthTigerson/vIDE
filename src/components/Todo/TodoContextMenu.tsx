import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { TODO_COLUMNS, TODO_SORT_MODES } from '@/lib/todoBoard'
import type { TodoSortDirection, TodoSortMode } from '@/lib/todoBoard'
import type { Todo, TodoStatus } from '@/types/api'

function MenuButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
    >
      {children}
    </button>
  )
}

function CheckableMenuButton({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <MenuButton onClick={onClick}>
      <span className="flex items-center justify-between">
        {children}
        {checked && <span className="text-accent">✓</span>}
      </span>
    </MenuButton>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}

function SubMenuButton({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        {label}
        <span className="text-fg-subtle">▸</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 z-10 w-40 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50">
          {children}
        </div>
      )}
    </div>
  )
}

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
  onArchive,
  onSortColumnMode,
  onSortAllMode,
  onSortColumnDirection,
  onSortAllDirection,
}: {
  x: number
  y: number
  todo: Todo
  columnSortMode: TodoSortMode
  columnSortDirection: TodoSortDirection
  onClose: () => void
  onDuplicate: () => void
  onMoveTo: (status: TodoStatus) => void
  onArchive: () => void
  onSortColumnMode: (mode: TodoSortMode) => void
  onSortAllMode: (mode: TodoSortMode) => void
  onSortColumnDirection: (direction: TodoSortDirection) => void
  onSortAllDirection: (direction: TodoSortDirection) => void
}) {
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
      <MenuDivider />
      <SortSubmenus
        columnSortMode={columnSortMode}
        columnSortDirection={columnSortDirection}
        onSelectColumnMode={withClose(onSortColumnMode)}
        onSelectAllMode={withClose(onSortAllMode)}
        onSelectColumnDirection={withClose(onSortColumnDirection)}
        onSelectAllDirection={withClose(onSortAllDirection)}
      />
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
}) {
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
    </div>,
    document.body
  )
}
