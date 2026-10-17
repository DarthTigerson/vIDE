import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { AssistantKind } from '@/types/api'
import type { AgentOption } from '@/lib/agentKinds'
import { isLlamaKind, TERMINAL_KIND } from '@/lib/agentKinds'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import type { Script } from '@/types/api'
import { ScriptsSubmenu } from '@/components/Scripts/ScriptsSubmenu'
import { ClaudeIcon, BridgeIcon, LlamaIcon, TerminalIcon, ScriptsIcon } from './ActivityBar'

const GAP_PX = 4

function kindIcon(kind: AssistantKind) {
  if (kind === 'claude') return <ClaudeIcon />
  if (isLlamaKind(kind)) return <LlamaIcon />
  return <BridgeIcon />
}

const ROW_CLASS = 'flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg'

// The "+" launcher: every agent available right now, then a plain Terminal
// that is always offered (it needs no agent enabled), then Scripts ▸ — a new
// terminal session that runs the picked script. Opens beside the
// activity bar (left of it when the bar is on the right) and is clamped into
// the viewport after measuring, like the session context menu.
export function NewSessionMenu({ anchor, side, options, onPick, onPickScript, onClose }: {
  anchor: DOMRect
  side: 'left' | 'right'
  options: Array<AgentOption & { running?: boolean }>
  onPick: (kind: AssistantKind) => void
  onPickScript?: (script: Script) => void
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
            className={ROW_CLASS}
          >
            <span className="text-fg-subtle">{kindIcon(option.kind)}</span>
            <span className="flex-1 truncate">{option.label}</span>
            {option.running && <span data-running className="h-1.5 w-1.5 rounded-full bg-green-500" title="Server running" />}
          </button>
        ))
      )}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        onClick={() => { onPick(TERMINAL_KIND); onClose() }}
        className={ROW_CLASS}
      >
        <span className="text-fg-subtle"><TerminalIcon /></span>
        <span className="flex-1 truncate">Terminal</span>
      </button>
      {onPickScript && (
        <ScriptsSubmenu
          opens={side === 'right' ? 'left' : 'right'}
          triggerClassName={ROW_CLASS}
          icon={<span className="text-fg-subtle [&>svg]:w-4 [&>svg]:h-4"><ScriptsIcon /></span>}
          onPick={(script) => { onPickScript(script); onClose() }}
        />
      )}
    </div>,
    document.body
  )
}
