import { useEffect, useState } from 'react'
import { FOOTER_TIPS } from '@/lib/footerTips'
import { useUpdateStore } from '@/stores/updateStore'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { formatResetTime } from '@/components/UsagePanel/format'
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
  const usageAlert = useUsageAlertStore((s) => s.alert)
  const available = useUpdateStore((s) => s.available)
  const status = useUpdateStore((s) => s.status)
  const upToDateVersion = useUpdateStore((s) => s.upToDateVersion)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const restart = useUpdateStore((s) => s.restart)
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

  if (usageAlert) {
    const scopeLabel = usageAlert.scope === 'session' ? 'Session' : 'Weekly'
    return (
      <button
        type="button"
        onClick={() => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false })}
        className={[positionClasses, 'text-amber-400 hover:underline cursor-pointer'].join(' ')}
      >
        {`${scopeLabel} usage may run out around ${formatResetTime(usageAlert.cutoffAt)} — click to view`}
      </button>
    )
  }

  if (available) {
    const label =
      status === 'ready'
        ? 'Update installed — click to restart'
        : status === 'updating'
          ? 'Updating vIDE… (see terminal)'
          : status === 'failed'
            ? `Update failed — click to retry (v${available.version} available)`
            : `vIDE v${available.version} is available — click to update`

    const onClick = status === 'ready' ? restart : status === 'updating' ? undefined : startUpdate

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={status === 'updating'}
        className={[
          positionClasses,
          status === 'updating'
            ? 'text-fg-subtle cursor-default'
            : 'text-accent hover:underline cursor-pointer',
        ].join(' ')}
      >
        {label}
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
