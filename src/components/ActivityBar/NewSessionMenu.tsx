import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { AssistantKind } from '@/types/api'
import type { AgentOption } from '@/lib/agentKinds'
import { isLlamaKind } from '@/lib/agentKinds'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { ClaudeIcon, BridgeIcon, LlamaIcon } from './ActivityBar'

const GAP_PX = 4

function kindIcon(kind: AssistantKind) {
  if (kind === 'claude') return <ClaudeIcon />
  if (isLlamaKind(kind)) return <LlamaIcon />
  return <BridgeIcon />
}

// The "+" launcher: every agent available right now. Opens beside the
// activity bar (left of it when the bar is on the right) and is clamped into
// the viewport after measuring, like the session context menu.
export function NewSessionMenu({ anchor, side, options, onPick, onClose }: {
  anchor: DOMRect
  side: 'left' | 'right'
  options: Array<AgentOption & { running?: boolean }>
  onPick: (kind: AssistantKind) => void
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
    const x = side === 'right' ? anchor.left - rect.width - GAP_PX : anchor.right + GAP_PX
    const clamped = clampToViewport(x, anchor.top, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [anchor, side])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="New session"
      className="fixed z-[200] w-52 rounded border border-border bg-sidebar p-1 shadow-2xl shadow-black/50"
      style={{ left: anchor.left, top: anchor.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {options.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-fg-muted">No agents enabled — turn one on in Settings</p>
      ) : (
        options.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="menuitem"
            onClick={() => { onPick(option.kind); onClose() }}
            className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
          >
            <span className="text-fg-subtle">{kindIcon(option.kind)}</span>
            <span className="flex-1 truncate">{option.label}</span>
            {option.running && <span data-running className="h-1.5 w-1.5 rounded-full bg-green-500" title="Server running" />}
          </button>
        ))
      )}
    </div>,
    document.body
  )
}
