import { useEffect, useRef, useState } from 'react'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationItems } from '@/hooks/useNotificationItems'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { footerPopupShadow } from '@/components/ui/footerPopup'

// Matches the duration-200 slide/fade below. The row buttons are only kept
// in the DOM while open or mid-close-transition — closed-and-settled means
// genuinely absent, not just CSS-hidden, so a stray click can never land on
// them regardless of any pointer-events/hit-testing edge case.
const CLOSE_TRANSITION_MS = 200

export function NotificationPanel() {
  const open = useNotificationPanelStore((s) => s.open)
  const close = useNotificationPanelStore((s) => s.close)
  const rawItems = useNotificationItems()
  const acknowledge = useNotificationAcknowledgedStore((s) => s.acknowledge)
  const acknowledgedIds = useNotificationAcknowledgedStore((s) => s.acknowledgedIds)
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)
  useCoverNativeViews(mounted)

  // Rows cleared with × / "Dismiss all" leave the panel right away; the
  // shared store keeps the bell's count in agreement (see dismissedIds).
  const dismissedIds = useNotificationAcknowledgedStore((s) => s.dismissedIds)
  const dismiss = useNotificationAcknowledgedStore((s) => s.dismiss)
  const items = rawItems.filter((item) => !dismissedIds.includes(item.id))

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
    // mousedown rather than click (VIDE-91) — matches the row/bell buttons
    // moving off onClick, and is the more standard "click outside" trigger
    // anyway since it doesn't wait on the browser's click synthesis at all.
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      // The bell/peek toggle the panel themselves on mouseup — closing
      // here first would just have them reopen it.
      if (target.closest?.('[data-notification-toggle]')) return
      if (panelRef.current && !panelRef.current.contains(target)) close()
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
        // Anchored above the bell (VIDE-140), right-aligned to it; mb lifts
        // it from the bell's top to the footer's top edge. bottom-full alone
        // leaves this fully visible either way, so the closed state also
        // fades to opacity-0 to actually hide it.
        'absolute bottom-full right-0 mb-[3px] w-[28rem] max-w-[92vw] z-40',
        'rounded-t border border-b-0 border-border bg-popover',
        footerPopupShadow,
        'origin-bottom transition-[opacity,transform] duration-200 ease-out',
        open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none',
      ].join(' ')}
    >
      {mounted && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-xs text-fg-muted">
          <span>
            <span className="font-semibold text-fg">Notifications</span> · {items.length}
          </span>
          {items.length > 0 && (
            <button
              type="button"
              onMouseUp={(e) => {
                if (e.button !== 0) return
                dismiss(items.map((item) => item.id))
              }}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              Dismiss all
            </button>
          )}
        </div>
      )}
      {mounted && (
        <ul className="max-h-40 overflow-y-auto overscroll-contain">
          {items.map((item) => (
            <li key={item.id} className="flex items-center">
              <button
                type="button"
                disabled={item.disabled}
                onMouseUp={(e) => {
                  if (e.button !== 0) return
                  item.onClick?.()
                  close()
                }}
                className={[
                  'flex flex-1 min-w-0 items-center gap-2 text-left px-3 py-1.5 text-xs transition-colors',
                  item.disabled ? 'text-fg-subtle cursor-default' : 'text-fg hover:bg-white/5 cursor-pointer',
                ].join(' ')}
              >
                <span
                  data-testid="notification-unread-dot"
                  className={[
                    'shrink-0 h-1.5 w-1.5 rounded-full',
                    acknowledgedIds.includes(item.id) ? 'bg-transparent' : 'bg-accent',
                  ].join(' ')}
                />
                <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{item.icon}</span>
                <span className="truncate">{item.text}</span>
              </button>
              <button
                type="button"
                aria-label="Dismiss notification"
                onMouseUp={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  dismiss([item.id])
                }}
                className="shrink-0 w-6 h-6 mr-1 flex items-center justify-center rounded text-fg-subtle hover:text-fg hover:bg-white/10"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
