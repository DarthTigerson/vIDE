import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { PreviousSessionIcon, ResumeSessionIcon, CompactIcon, ClearIcon, RenameIcon } from './ActivityBar'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import type { AssistantKind } from '@/types/api'
import { isTerminalKind } from '@/lib/agentKinds'

interface Props {
  x: number
  y: number
  kind: AssistantKind
  onRename: () => void
  onContinuePreviousSession: () => void
  onResumeSession: () => void
  onRestorePrevious: () => void
  onCompact: () => void
  onClear: () => void
  onCloseSession: () => void
  onCloseAllSessions: () => void
  // Omitted when this is the only session — the row is hidden, since there
  // would be nothing to close.
  onCloseOtherSessions?: () => void
  onClose: () => void
}

export function ClaudeSessionContextMenu({
  x,
  y,
  kind,
  onRename,
  onContinuePreviousSession,
  onResumeSession,
  onRestorePrevious,
  onCompact,
  onClear,
  onCloseSession,
  onCloseAllSessions,
  onCloseOtherSessions,
  onClose,
}: Props) {
  useCoverNativeViews()
  const isClaude = kind === 'claude'
  const isTerminal = isTerminalKind(kind)
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
  // matches RefContextMenu / CommitContextMenu.
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
      <button
        type="button"
        onClick={() => { onRename(); onClose() }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        <RenameIcon />
        Rename…
      </button>
      <div className="my-1 h-px bg-border" />
      {isClaude ? (
        <>
          <button
            type="button"
            onClick={() => { onContinuePreviousSession(); onClose() }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
          >
            <PreviousSessionIcon />
            Continue Previous Session
          </button>
          <button
            type="button"
            onClick={() => { onResumeSession(); onClose() }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
          >
            <ResumeSessionIcon />
            Resume Session…
          </button>
        </>
      ) : !isTerminal && (
        <button
          type="button"
          onClick={() => { onRestorePrevious(); onClose() }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
        >
          <PreviousSessionIcon />
          Restore Previous Conversation
        </button>
      )}
      {!isTerminal && <div className="my-1 h-px bg-border" />}
      {isClaude && (
        <button
          type="button"
          onClick={() => { onCompact(); onClose() }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
        >
          <CompactIcon />
          Compact
        </button>
      )}
      <button
        type="button"
        onClick={() => { onClear(); onClose() }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        <ClearIcon />
        Clear
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={() => { onCloseSession(); onClose() }}
        className="w-full rounded px-2 py-1.5 text-left text-xs text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
      >
        Close Session
      </button>
      {onCloseOtherSessions && (
        <button
          type="button"
          onClick={() => { onCloseOtherSessions(); onClose() }}
          className="w-full rounded px-2 py-1.5 text-left text-xs text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
        >
          Close Other Sessions
        </button>
      )}
      <button
        type="button"
        onClick={() => { onCloseAllSessions(); onClose() }}
        className="w-full rounded px-2 py-1.5 text-left text-xs text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
      >
        Close All Sessions
      </button>
    </div>,
    document.body
  )
}
