import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import type { RefTarget } from './commitFormat'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

interface Props {
  x: number
  y: number
  name: string
  kind: RefTarget['kind']
  onCheckout: () => void
  onClose: () => void
}

export function RefContextMenu({ x, y, name, kind, onCheckout, onClose }: Props) {
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

  // Measure the actual rendered menu and clamp for real, before paint —
  // matches CommitContextMenu / CommitFileContextMenu.
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
      className="fixed z-[200] w-52 rounded-sm border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { onCheckout(); onClose() }}
        className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg truncate"
      >
        Checkout {kind === 'tag' ? 'tag' : 'branch'} {name}
      </button>
    </div>,
    document.body
  )
}
