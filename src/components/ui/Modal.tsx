import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { useRestoreFocus } from '@/lib/useRestoreFocus'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ onClose, children }: ModalProps) {
  useCoverNativeViews()
  useRestoreFocus()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Portaled to document.body rather than rendered inline: a `bg-sidebar`/
  // bg-panel` ancestor with `backdrop-filter` (the "glossy" panel style)
  // creates a new CSS containing block that traps `position: fixed`
  // descendants inside it, confining this to wherever the caller happens to
  // sit in the tree instead of the whole window - same root cause as the
  // BranchPalette and context-menu overlay bugs.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 p-6 min-w-[320px] max-w-sm w-full">
        {children}
      </div>
    </div>,
    document.body
  )
}
