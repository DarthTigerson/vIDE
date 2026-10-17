import { useEffect, useRef, useState } from 'react'
import { useVisibleNotificationItems } from '@/hooks/useVisibleNotificationItems'
import { useNotificationArrival } from '@/hooks/useNotificationArrival'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { footerPopupShadow } from '@/components/ui/footerPopup'

// How long each peeked row stays up; matches the `notification-peek-drain`
// keyframes duration in index.css.
export const PEEK_MS = 5000
// A row stays mounted this long after expiring so it can fade out.
const CLOSE_TRANSITION_MS = 200

interface PeekEntry {
  id: string
  // When this row expires. Pushed back by however long the peek is
  // hovered, matching its drain line, which pauses on hover.
  deadline: number
  leaving: boolean
}

// A brief look at newly arrived notifications (VIDE-140), shown where the
// notification panel opens — above the bell. Each arrival gets its own row
// with its own PEEK_MS countdown: a later one stacks beneath what's showing
// (newest at the bottom, right above the bell) without resetting the
// others, and the peek closes once its last row has expired. Unlike the
// panel, expiring does NOT acknowledge anything — the bell stays filled
// until the user actually opens the panel. Hovering pauses every row.
// Shown at every window width — anchored right above the bell, it fits
// half width as well as full.
export function NotificationPeek() {
  const panelOpen = useNotificationPanelStore((s) => s.open)
  const togglePanel = useNotificationPanelStore((s) => s.toggle)
  const acknowledge = useNotificationAcknowledgedStore((s) => s.acknowledge)
  const visibleItems = useVisibleNotificationItems()
  const arrival = useNotificationArrival(PEEK_MS)
  const [entries, setEntries] = useState<PeekEntry[]>([])
  const hoveredAt = useRef<number | null>(null)
  const [hovered, setHovered] = useState(false)

  const lastSeq = useRef<number | null>(null)
  useEffect(() => {
    if (!arrival || lastSeq.current === arrival.seq) return
    lastSeq.current = arrival.seq
    const deadline = arrival.at + PEEK_MS
    setEntries((prev) => [
      ...prev.filter((e) => !arrival.ids.includes(e.id)),
      ...arrival.ids.map((id) => ({ id, deadline, leaving: false })),
    ])
  }, [arrival])

  // Opening the full panel replaces the peek outright.
  useEffect(() => {
    if (panelOpen) setEntries([])
  }, [panelOpen])

  // One timer for the next thing due: a row starting to fade, or a faded
  // row being removed. Re-armed whenever the entries change.
  useEffect(() => {
    if (hovered || entries.length === 0) return
    const due = (e: PeekEntry) => (e.leaving ? e.deadline + CLOSE_TRANSITION_MS : e.deadline)
    const next = Math.min(...entries.map(due))
    const timer = setTimeout(() => {
      const now = Date.now()
      setEntries((prev) =>
        prev
          .filter((e) => !(e.leaving && e.deadline + CLOSE_TRANSITION_MS <= now))
          .map((e) => (!e.leaving && e.deadline <= now ? { ...e, leaving: true } : e)),
      )
    }, Math.max(0, next - Date.now()))
    return () => clearTimeout(timer)
  }, [entries, hovered])

  // Looked up among visible (unacknowledged) items, so a row goes away as
  // soon as it's seen in the panel or its condition clears.
  const rows = entries
    .map((entry) => ({ entry, item: visibleItems.find((item) => item.id === entry.id) }))
    .filter((row): row is { entry: PeekEntry; item: NonNullable<typeof row.item> } => !!row.item)
  useCoverNativeViews(rows.length > 0 && !panelOpen)
  if (rows.length === 0 || panelOpen) return null
  const closing = rows.every((row) => row.entry.leaving)
  const others = visibleItems.length - rows.length

  return (
    <div
      data-testid="notification-peek"
      data-notification-toggle=""
      onMouseEnter={() => {
        hoveredAt.current = Date.now()
        setHovered(true)
      }}
      onMouseLeave={() => {
        const pausedFor = hoveredAt.current === null ? 0 : Date.now() - hoveredAt.current
        hoveredAt.current = null
        setEntries((prev) => prev.map((e) => (e.leaving ? e : { ...e, deadline: e.deadline + pausedFor })))
        setHovered(false)
      }}
      className={[
        'notification-peek absolute bottom-full right-0 mb-[3px] w-[28rem] max-w-[92vw] z-40',
        'overflow-hidden rounded-t border border-b-0 border-border bg-popover',
        footerPopupShadow,
        'transition-[opacity,transform] duration-200 ease-out',
        closing ? 'opacity-0 translate-y-1 pointer-events-none' : 'opacity-100 translate-y-0',
      ].join(' ')}
    >
      {others > 0 && (
        <button
          type="button"
          onMouseUp={(e) => {
            if (e.button !== 0) return
            togglePanel()
          }}
          className="w-full text-left px-3 py-1 text-xs text-fg-muted hover:text-fg border-b border-border transition-colors"
        >
          +{others} more
        </button>
      )}
      <ul>
        {rows.map(({ entry, item }) => (
          <li
            key={item.id}
            data-leaving={entry.leaving || undefined}
            className={[
              'notification-peek-row-in relative transition-opacity duration-200',
              entry.leaving ? 'opacity-0' : 'opacity-100',
            ].join(' ')}
          >
            <button
              type="button"
              disabled={item.disabled}
              // mouseup rather than onClick (VIDE-91), same as the panel rows.
              onMouseUp={(e) => {
                if (e.button !== 0) return
                item.onClick?.()
                acknowledge([item.id])
                setEntries((prev) => prev.filter((p) => p.id !== item.id))
              }}
              className={[
                'flex w-full min-w-0 items-center gap-2 text-left px-3 py-1.5 text-xs transition-colors',
                item.disabled ? 'text-fg-subtle cursor-default' : 'text-fg hover:bg-white/5 cursor-pointer',
              ].join(' ')}
            >
              <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="shrink-0 text-accent [&_svg]:h-3.5 [&_svg]:w-3.5">{item.icon}</span>
              <span className="truncate">{item.text}</span>
            </button>
            {/* This row's own countdown. */}
            <span className="notification-peek-drain absolute left-0 bottom-0 h-px w-full bg-accent/50" />
          </li>
        ))}
      </ul>
    </div>
  )
}
