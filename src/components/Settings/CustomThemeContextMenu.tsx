import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'

function MenuButton({ label, danger = false, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
        danger
          ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200'
          : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}

// Right-click menu for a custom theme card — replaces the hover edit/delete
// icons, which sat directly on top of the swatch strip and the theme name at
// this card size. Same createPortal + clampToViewport pattern as
// EditorContextMenu/TabContextMenu/CommitContextMenu.
export function CustomThemeContextMenu({ x, y, onEdit, onShare, onDelete, onClose }: {
  x: number
  y: number
  onEdit: () => void
  onShare: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = () => onClose()
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [x, y])

  function run(action: () => void) {
    return () => {
      action()
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
      <MenuButton label="Edit" onClick={run(onEdit)} />
      <MenuButton label="Share Theme" onClick={run(onShare)} />
      <MenuDivider />
      <MenuButton label="Delete" danger onClick={run(onDelete)} />
    </div>,
    document.body,
  )
}
