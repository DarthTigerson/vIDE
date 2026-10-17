import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { ContextMenuButton } from '@/components/Git/ContextMenu'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

// Right-click menu for an app on the activity bar or in the All Apps panel —
// the non-drag way to favorite/unfavorite. Positioning/closing matches
// SearchFileContextMenu.
export function AppFavoriteContextMenu({ x, y, favorite, onToggle, onClose }: {
  x: number
  y: number
  favorite: boolean
  onToggle: () => void
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

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <ContextMenuButton role="menuitem" onClick={() => { onToggle(); onClose() }}>
        {favorite ? 'Remove from Favorites' : 'Add to Favorites'}
      </ContextMenuButton>
    </div>,
    document.body
  )
}
