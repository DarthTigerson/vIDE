import { useEffect, useState } from 'react'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useDockerOffAlertStore } from '@/stores/dockerOffAlertStore'
import { formatCountdownClock } from '@/components/UsagePanel/format'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'

export interface NotificationItem {
  id: 'usage' | 'docker' | 'update'
  text: string
  disabled: boolean
  onClick?: () => void
}

export function useNotificationItems(): NotificationItem[] {
  const usageAlert = useUsageAlertStore((s) => s.alert)
  const dockerEnabled = useDockerSettingsStore((s) => s.enabled)
  const dockerStatus = useDockerStore((s) => s.status)
  const requestDockerOpen = useDockerOffAlertStore((s) => s.requestOpen)
  const available = useUpdateStore((s) => s.available)
  const status = useUpdateStore((s) => s.status)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const restart = useUpdateStore((s) => s.restart)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!usageAlert) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [usageAlert])

  const items: NotificationItem[] = []

  if (usageAlert) {
    const scopeLabel = usageAlert.scope === 'session' ? 'Session' : 'Weekly'
    const ranOut = now >= usageAlert.cutoffAt
    const text = ranOut
      ? usageAlert.resetAt != null
        ? `${scopeLabel} usage ran out — resets in ${formatCountdownClock(usageAlert.resetAt, now)}`
        : `${scopeLabel} usage ran out`
      : `${scopeLabel} usage may run out in ${formatCountdownClock(usageAlert.cutoffAt, now)}`
    items.push({
      id: 'usage',
      text,
      disabled: false,
      onClick: () => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false }),
    })
  }

  if (dockerEnabled && dockerStatus === 'stopped') {
    items.push({ id: 'docker', text: "Docker isn't running", disabled: false, onClick: requestDockerOpen })
  }

  if (available) {
    const text =
      status === 'ready'
        ? 'Update installed — click to restart'
        : status === 'updating'
          ? 'Updating vIDE… (see terminal)'
          : status === 'failed'
            ? `Update failed — click to retry (v${available.version} available)`
            : `vIDE v${available.version} is available — click to update`
    const onClick = status === 'ready' ? restart : status === 'updating' ? undefined : startUpdate
    items.push({ id: 'update', text, disabled: status === 'updating', onClick })
  }

  return items
}
