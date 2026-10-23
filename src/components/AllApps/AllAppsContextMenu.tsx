import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { MenuButton, MenuDivider } from '@/components/ui/MenuItems'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

// Right-click menu on an All Apps row: open the app's settings page, and
// turn the app off (omitted for apps without an Enable switch) or, on a
// Disabled row, back on.
export function AllAppsContextMenu({ x, y, onSettings, onDisable, onEnable, onClose }: {
  x: number
  y: number
  onSettings: () => void
  onDisable?: () => void
  onEnable?: () => void
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
      className="fixed z-[200] w-40 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {onEnable && <MenuButton onClick={() => { onEnable(); onClose() }}>Enable</MenuButton>}
      <MenuButton onClick={() => { onSettings(); onClose() }}>Settings</MenuButton>
      {onDisable && (
        <>
          <MenuDivider />
          <MenuButton danger onClick={() => { onDisable(); onClose() }}>Disable</MenuButton>
        </>
      )}
    </div>,
    document.body
  )
}
