import { useEffect, useRef, useState } from 'react'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationItems } from '@/hooks/useNotificationItems'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'

// Matches the duration-200 slide/fade below. The row buttons are only kept
// in the DOM while open or mid-close-transition — closed-and-settled means
// genuinely absent, not just CSS-hidden, so a stray click can never land on
// them regardless of any pointer-events/hit-testing edge case.
const CLOSE_TRANSITION_MS = 200

export function NotificationPanel() {
  const open = useNotificationPanelStore((s) => s.open)
  const close = useNotificationPanelStore((s) => s.close)
  // Raw/unfiltered — the panel always lists every currently-active
  // notification, viewed or not. Acknowledgment only quiets the footer's
  // loud text (see useVisibleNotificationItems), never hides anything here.
  const items = useNotificationItems()
  const acknowledge = useNotificationAcknowledgedStore((s) => s.acknowledge)
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)

  // Closing (any path — row pick, outside click, Escape, auto-close) marks
  // whatever was showing as acknowledged, quieting the footer's loud text
  // until it clears and re-triggers — it stays listed here regardless.
  const wasOpenRef = useRef(open)
  useEffect(() => {
    if (wasOpenRef.current && !open) acknowledge(items.map((item) => item.id))
    wasOpenRef.current = open
  }, [open, items, acknowledge])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const timer = setTimeout(() => setMounted(false), CLOSE_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [open])

  // Auto-close rather than leave the panel open on an empty list — the
  // condition that was showing (usage back on track, Docker restarted, etc.)
  // has already resolved itself.
  useEffect(() => {
    if (open && items.length === 0) close()
  }, [open, items.length, close])

  useEffect(() => {
    if (!open) return
    // mousedown rather than click (VIDE-91) — matches the row/teaser buttons
    // moving off onClick, and is the more standard "click outside" trigger
    // anyway since it doesn't wait on the browser's click synthesis at all.
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  return (
    <div
      ref={panelRef}
      data-testid="notification-panel"
      className={[
        // Centered via inset-x-0 + mx-auto (no transform) so the transform
        // is free for the open/close slide below — combining a centering
        // translate-x with an animated translate-y on the same element is
        // fragile. bottom-full alone leaves this fully visible either way
        // (it only ever repositions within visible space), so the closed
        // state also fades to opacity-0 to actually hide it.
        'absolute bottom-full inset-x-0 mx-auto w-[34rem] max-w-[92vw] z-40',
        'rounded-t border border-b-0 border-border bg-popover shadow-lg shadow-black/40',
        'origin-bottom transition-[opacity,transform] duration-200 ease-out',
        open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none',
      ].join(' ')}
    >
      {mounted && (
        <ul className="h-40 overflow-y-auto overscroll-contain">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                onMouseUp={(e) => {
                  if (e.button !== 0) return
                  item.onClick?.()
                  close()
                }}
                className={[
                  'flex w-full items-center gap-2 text-left px-3 py-1.5 text-xs transition-colors',
                  item.disabled ? 'text-fg-subtle cursor-default' : 'text-fg hover:bg-white/5 cursor-pointer',
                ].join(' ')}
              >
                <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{item.icon}</span>
                <span className="truncate">{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
