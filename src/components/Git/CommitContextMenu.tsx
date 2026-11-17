import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { copyToClipboard } from './commitFormat'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

interface Props {
  x: number
  y: number
  message: string
  hash: string
  onClose: () => void
}

export function CommitContextMenu({ x, y, message, hash, onClose }: Props) {
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
  // matches GitPanel's file context menu (same overhang problem otherwise).
  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [x, y])

  function copy(text: string) {
    copyToClipboard(text)
    onClose()
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-40 rounded-sm border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => copy(message)}
        className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        Copy Message
      </button>
      <button
        type="button"
        onClick={() => copy(hash)}
        className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        Copy Hash
      </button>
    </div>,
    document.body
  )
}
