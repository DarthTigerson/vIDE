import { useEffect, useState } from 'react'
import { FOOTER_TIPS } from '@/lib/footerTips'
import { useUpdateStore } from '@/stores/updateStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationItems } from '@/hooks/useNotificationItems'
import { Clock } from './Clock'

const ROTATE_INTERVAL_MS = 9000
const FADE_MS = 200

function randomTipIndex(exclude?: number): number {
  if (FOOTER_TIPS.length <= 1) return 0
  let next = Math.floor(Math.random() * FOOTER_TIPS.length)
  while (next === exclude) next = Math.floor(Math.random() * FOOTER_TIPS.length)
  return next
}

export function FooterMessage() {
  const transientMessage = useStatusMessageStore((s) => s.message)
  const items = useNotificationItems()
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

  if (items.length > 0) {
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
        className={[positionClasses, 'text-accent hover:underline cursor-pointer'].join(' ')}
      >
        {items[0].text}
      </button>
    )
  }

  if (upToDateVersion) {
    return (
      <span className={[positionClasses, 'text-accent select-none pointer-events-none'].join(' ')}>
        {`You're on the latest version — v${upToDateVersion}`}
      </span>
    )
  }

  if (footerContent === 'clock') {
    return (
      <span className={[positionClasses, 'pointer-events-none'].join(' ')}>
        <Clock />
      </span>
    )
  }

  return (
    <span
      className={[
        positionClasses,
        'text-fg-subtle select-none pointer-events-none transition-opacity',
        fading ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {FOOTER_TIPS[tipIndex]}
    </span>
  )
}
