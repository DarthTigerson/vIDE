import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { ShortcutKeys } from '@/components/ui/ShortcutKeys'
import { isMac } from '@/lib/platform'
import { copyText } from '@/lib/copyText'
import { formatTerminalSelectionForAssistant } from '@/lib/sendSelectionToAssistant'
import { useClaudeStore } from '@/stores/claudeStore'

const SEND_HINT = isMac ? '⌘L' : 'Ctrl+L'

function MenuButton({ children, hint, disabled, onClick }: {
  children: ReactNode
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
    >
      <span>{children}</span>
      {hint && <ShortcutKeys shortcut={hint} />}
    </button>
  )
}

// Right-click menu for a terminal tab. `selection` is read by the caller at
// the moment the menu opens, so the actions act on what was highlighted then.
export function TerminalContextMenu({ x, y, selection, onClose }: {
  x: number
  y: number
  selection: string
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const hasSelection = selection.length > 0

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
      className="fixed z-[200] w-52 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuButton
        disabled={!hasSelection}
        onClick={() => {
          copyText(selection)
          onClose()
        }}
      >
        Copy
      </MenuButton>
      <MenuButton
        disabled={!hasSelection}
        hint={SEND_HINT}
        onClick={() => {
          useClaudeStore.getState().sendSelection(formatTerminalSelectionForAssistant(selection))
          onClose()
        }}
      >
        Send to Claude
      </MenuButton>
    </div>,
    document.body
  )
}
