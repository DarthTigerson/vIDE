import { useNotificationItems } from '@/hooks/useNotificationItems'
import { useVisibleNotificationItems } from '@/hooks/useVisibleNotificationItems'
import { useNotificationArrival } from '@/hooks/useNotificationArrival'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'
import { BellIcon } from '@/components/ActivityBar/ActivityBar'
import { FooterTooltip } from './FooterTooltip'

// Matches the `notification-bell-ring` keyframes duration in index.css.
const RING_MS = 900

// The footer's notification toggle at every window width (VIDE-140): bell
// and count fused into one pill so they read as a single thing. Filled
// accent while anything is unread (not yet acknowledged by closing the
// panel on it), a plain outline once everything has been seen, and just a
// muted bell with nothing active. Count = every active, non-dismissed
// notification, seen or not — the same rows the panel lists.
export function NotificationBell() {
  const dismissedIds = useNotificationAcknowledgedStore((s) => s.dismissedIds)
  // Dismissed rows are gone from the panel, so they don't count either.
  const items = useNotificationItems().filter((item) => item.urgent || !dismissedIds.includes(item.id))
  const visibleItems = useVisibleNotificationItems()
  const toggle = useNotificationPanelStore((s) => s.toggle)
  const panelOpen = useNotificationPanelStore((s) => s.open)
  const ringing = useNotificationArrival(RING_MS)
  const count = items.length
  const unread = visibleItems.length > 0
  // Red instead of accent while an urgent row (e.g. a security update) is up.
  const urgent = visibleItems.some((item) => item.urgent)

  return (
    <FooterTooltip label="Notifications" hidden={panelOpen}>
      <button
        type="button"
        data-testid="notification-bell"
        // NotificationPanel ignores outside-mousedowns that land on this, so
        // clicking the bell while the panel is open toggles it shut instead
        // of closing on mousedown and immediately reopening on mouseup.
        data-notification-toggle=""
        disabled={count === 0}
        // mouseup rather than onClick (VIDE-91): a ticking usage countdown
        // re-renders this every second, which can break click synthesis.
        onMouseUp={(e) => {
          if (count > 0 && e.button === 0) toggle()
        }}
        aria-label={count > 0 ? `${count} notification${count === 1 ? '' : 's'}` : 'Notifications'}
        className={[
          'flex h-5 shrink-0 items-center justify-center gap-1 rounded-full border text-xs tabular-nums transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5',
          count === 0
            ? 'w-5 border-border bg-bg text-fg-subtle cursor-default'
            : urgent
              ? 'pl-1.5 pr-2 border-red-500 bg-red-500 text-white cursor-pointer'
              : unread
                ? 'pl-1.5 pr-2 border-accent bg-accent text-on-accent cursor-pointer'
                : 'pl-1.5 pr-2 border-border bg-bg text-fg-muted hover:text-fg hover:border-fg-subtle cursor-pointer',
        ].join(' ')}
      >
        <span key={ringing?.seq} className={ringing ? 'notification-bell-ring flex' : 'flex'}>
          <BellIcon />
        </span>
        {count > 0 && <span>{count}</span>}
      </button>
    </FooterTooltip>
  )
}
