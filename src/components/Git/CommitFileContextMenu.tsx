import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

interface Props {
  x: number
  y: number
  onCopyPath: () => void
  onOpenFile: () => void
  onOpenDiff: () => void
  onRevealInFileTree: () => void
  onClose: () => void
}

export function CommitFileContextMenu({ x, y, onCopyPath, onOpenFile, onOpenDiff, onRevealInFileTree, onClose }: Props) {
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
  // matches CommitContextMenu / GitPanel's file context menu.
  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [x, y])

  function run(action: () => void) {
    action()
    onClose()
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-36 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => run(onOpenDiff)}
        className="w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        Open Diff
      </button>
      <button
        type="button"
        onClick={() => run(onOpenFile)}
        className="w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        Open File
      </button>
      <button
        type="button"
        onClick={() => run(onRevealInFileTree)}
        className="w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        Reveal in Site Tree
      </button>
      <button
        type="button"
        onClick={() => run(onCopyPath)}
        className="w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        Copy Path
      </button>
    </div>,
    document.body
  )
}
