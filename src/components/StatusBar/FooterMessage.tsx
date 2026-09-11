import { useEffect, useState } from 'react'
import { FOOTER_TIPS } from '@/lib/footerTips'
import { useUpdateStore } from '@/stores/updateStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationItems } from '@/hooks/useNotificationItems'
import { useVisibleNotificationItems } from '@/hooks/useVisibleNotificationItems'
import { Clock } from './Clock'

const ROTATE_INTERVAL_MS = 9000
const FADE_MS = 200

// Shared by every state the pill can be in (notification / clock / tip) so
// the footer always reads as the same "notification toggle" element — only
// its interactivity and text color change depending on whether there's
// anything active to open the panel for.
const PILL_BASE_CLASSES =
  'absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto flex h-5 w-[34rem] max-w-[92vw] items-center justify-center rounded-full border border-border bg-bg px-3 text-xs transition-colors'

function randomTipIndex(exclude?: number): number {
  if (FOOTER_TIPS.length <= 1) return 0
  let next = Math.floor(Math.random() * FOOTER_TIPS.length)
  while (next === exclude) next = Math.floor(Math.random() * FOOTER_TIPS.length)
  return next
}

export function FooterMessage() {
  const transientMessage = useStatusMessageStore((s) => s.message)
  // Raw (unfiltered) — the toggle stays clickable and the panel shows every
  // active notification regardless of acknowledgment. Only the loud footer
  // *text* goes quiet once viewed (visibleItems, below).
  const rawItems = useNotificationItems()
  const visibleItems = useVisibleNotificationItems()
  const toggleNotificationPanel = useNotificationPanelStore((s) => s.toggle)
  const upToDateVersion = useUpdateStore((s) => s.upToDateVersion)
  const footerContent = useDisplayStore((s) => s.footerContent)

  const [tipIndex, setTipIndex] = useState(() => randomTipIndex())
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setTipIndex((i) => randomTipIndex(i))
        setFading(false)
      }, FADE_MS)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const positionClasses = 'absolute left-1/2 -translate-x-1/2 max-w-[45%] truncate text-xs'

  if (transientMessage) {
    return (
      <span className={[positionClasses, 'text-accent select-none pointer-events-none'].join(' ')}>
        {transientMessage}
      </span>
    )
  }

  if (upToDateVersion) {
    return (
      <span className={[positionClasses, 'text-accent select-none pointer-events-none'].join(' ')}>
        {`You're on the latest version — v${upToDateVersion}`}
      </span>
    )
  }

  const pillContent =
    visibleItems.length > 0 ? (
      <span className="truncate">{visibleItems[0].text}</span>
    ) : footerContent === 'clock' ? (
      <Clock />
    ) : (
      <span
        className={['truncate transition-opacity', fading ? 'opacity-0' : 'opacity-100'].join(' ')}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        {FOOTER_TIPS[tipIndex]}
      </span>
    )

  if (rawItems.length > 0) {
    return (
      <button
        type="button"
        data-testid="notification-teaser"
        // onMouseUp rather than onClick (VIDE-91): the countdown re-renders
        // this button every second, and a real click that straddles one of
        // those re-renders can fail the browser's mousedown/mouseup ==
        // same-target check that click synthesis depends on. mouseup has no
        // such requirement.
        onMouseUp={(e) => {
          if (e.button === 0) toggleNotificationPanel()
        }}
        className={[
          PILL_BASE_CLASSES,
          'cursor-pointer hover:border-fg-subtle',
          visibleItems.length > 0 ? 'text-accent' : 'text-fg-muted',
        ].join(' ')}
      >
        {pillContent}
      </button>
    )
  }

  return <span className={[PILL_BASE_CLASSES, 'pointer-events-none select-none text-fg-subtle'].join(' ')}>{pillContent}</span>
}
