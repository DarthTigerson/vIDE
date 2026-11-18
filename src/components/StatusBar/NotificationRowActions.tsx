import type { NotificationItem } from '@/hooks/useNotificationItems'

const PILL = 'shrink-0 h-5 px-2 rounded-full text-[0.625rem] font-bold whitespace-nowrap transition-colors'

// A notification row's buttons, shared by the panel and the peek: the
// secondary one (e.g. Snooze) as a soft bubble, then the main one filled.
// `after` runs once either has done its work (the panel closes itself).
export function NotificationRowActions({ item, after }: { item: NotificationItem; after?: () => void }) {
  const buttons = [
    item.secondaryAction && { ...item.secondaryAction, primary: false },
    item.action && { ...item.action, primary: true },
  ].filter((b): b is { label: string; onClick: () => void; primary: boolean } => !!b)
  if (buttons.length === 0) return null

  return (
    <span className="flex shrink-0 items-center gap-1 mr-0.5">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          // mouseup rather than onClick (VIDE-91), same as the rows.
          onMouseUp={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            b.onClick()
            after?.()
          }}
          className={[
            PILL,
            !b.primary
              ? 'bg-fg/10 text-fg hover:bg-fg/20'
              : item.urgent
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-accent/85 text-on-accent hover:bg-accent',
          ].join(' ')}
        >
          {b.label}
        </button>
      ))}
    </span>
  )
}
