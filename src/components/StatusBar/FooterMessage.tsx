import { useEffect, useState } from 'react'
import { FOOTER_TIPS } from '@/lib/footerTips'
import { useUpdateStore } from '@/stores/updateStore'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useEditorStore } from '@/stores/editorStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useDockerOffAlertStore } from '@/stores/dockerOffAlertStore'
import { useFileStore } from '@/stores/fileStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { formatCountdownClock } from '@/components/UsagePanel/format'
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
  const dockerEnabled = useDockerSettingsStore((s) => s.enabled)
  const dockerStatus = useDockerStore((s) => s.status)
  const dockerOffIgnored = useDockerOffAlertStore((s) => s.ignored)
  const ignoreDockerOff = useDockerOffAlertStore((s) => s.ignore)
  const resetDockerOffIgnore = useDockerOffAlertStore((s) => s.reset)
  const requestDockerOpen = useDockerOffAlertStore((s) => s.requestOpen)
  const projectRoot = useFileStore((s) => s.projectRoot)
  // Only for someone who normally works with Docker (enabled in settings)
  // and has it installed but not currently running — "not-installed" is a
  // different situation (nothing to turn back on) and isn't nagged about here.
  const dockerOff = dockerEnabled && dockerStatus === 'stopped' && !dockerOffIgnored

  // "Ignore" only covers the current off-stretch in the current project —
  // Docker coming back up (even briefly) or switching/reopening the project
  // both clear it, so a stale ignore from a different situation never hides
  // a fresh one.
  useEffect(() => {
    if (dockerStatus !== 'stopped') resetDockerOffIgnore()
  }, [dockerStatus, resetDockerOffIgnore])

  useEffect(() => {
    resetDockerOffIgnore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot])

  const [tipIndex, setTipIndex] = useState(() => randomTipIndex())
  const [fading, setFading] = useState(false)
  const [now, setNow] = useState(() => Date.now())

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

  useEffect(() => {
    if (!usageAlert) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [usageAlert])

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
        {`${scopeLabel} usage may run out in ${formatCountdownClock(usageAlert.cutoffAt, now)} — click to view`}
      </button>
    )
  }

  if (dockerOff) {
    return (
      <span className="absolute left-1/2 -translate-x-1/2 max-w-[45%] flex items-center gap-1.5 text-xs">
        <span className="truncate text-fg-muted">Docker isn't running</span>
        <button
          type="button"
          onClick={requestDockerOpen}
          className="shrink-0 rounded-full border border-amber-400 text-amber-400 px-2 py-0.5 text-[10.5px] leading-none hover:bg-amber-400/10 cursor-pointer"
        >
          Open panel
        </button>
        <button
          type="button"
          onClick={ignoreDockerOff}
          className="shrink-0 rounded-full border border-border text-fg-muted px-2 py-0.5 text-[10.5px] leading-none hover:bg-white/5 hover:text-fg cursor-pointer"
        >
          Ignore
        </button>
      </span>
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
