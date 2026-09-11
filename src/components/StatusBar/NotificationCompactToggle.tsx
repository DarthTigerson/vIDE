import { useNotificationItems } from '@/hooks/useNotificationItems'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { BellIcon } from '@/components/ActivityBar/ActivityBar'

// Fallback for FooterMessage's centered pill once the window is too narrow
// for it (see the matching `hidden min-[1200px]:flex` there) — same
// rounded/bordered treatment as the font-size control it sits next to.
// Always shown as a plain bell; only its color and clickability change with
// whether a notification is active, no per-type icon here.
export function NotificationCompactToggle() {
  const items = useNotificationItems()
  const toggle = useNotificationPanelStore((s) => s.toggle)
  const active = items.length > 0

  return (
    <button
      type="button"
      data-testid="notification-compact-toggle"
      disabled={!active}
      // mouseup rather than onClick (VIDE-91) — same reasoning as the wide
      // pill: the live title text below re-renders this button every second.
      onMouseUp={(e) => {
        if (active && e.button === 0) toggle()
      }}
      title={active ? items[0].text : undefined}
      aria-label="Notifications"
      className={[
        'flex min-[1200px]:hidden h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-bg transition-colors [&_svg]:h-3 [&_svg]:w-3',
        active ? 'text-accent hover:border-fg-subtle cursor-pointer' : 'text-fg-subtle cursor-default',
      ].join(' ')}
    >
      <BellIcon />
    </button>
  )
}
