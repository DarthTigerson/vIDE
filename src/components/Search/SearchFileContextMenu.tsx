import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { ContextMenuButton, ContextMenuDivider } from '@/components/Git/ContextMenu'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

export interface SearchFileMenuActions {
  onOpen: () => void
  onRevealInFileTree: () => void
  onCopy: () => void
  onCopyPath: () => void
  onRevealInFinder: () => void
  onTrash: () => void
}

// Right-click menu for a Search panel result's file row - the file-level
// actions from the file tree's menu that still make sense for a search hit.
// Positioning/closing matches CommitFileContextMenu.
export function SearchFileContextMenu({ x, y, onClose, ...actions }: SearchFileMenuActions & {
  x: number
  y: number
  onClose: () => void
}) {
  useCoverNativeViews()
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

  function item(label: string, action: () => void, danger = false) {
    return (
      <ContextMenuButton role="menuitem" danger={danger} onClick={() => { action(); onClose() }}>
        {label}
      </ContextMenuButton>
    )
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {item('Open / Edit', actions.onOpen)}
      {item('Reveal in Site Tree', actions.onRevealInFileTree)}
      <ContextMenuDivider />
      {item('Copy', actions.onCopy)}
      {item('Copy Path', actions.onCopyPath)}
      {item('Reveal in Finder', actions.onRevealInFinder)}
      <ContextMenuDivider />
      {item('Move to Trash', actions.onTrash, true)}
    </div>,
    document.body
  )
}
