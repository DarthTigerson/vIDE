import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useDockerOffAlertStore } from '@/stores/dockerOffAlertStore'
import { useGitStore } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitPanelOpenAlertStore } from '@/stores/gitPanelOpenAlertStore'
import { formatCountdownClock } from '@/components/UsagePanel/format'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { ClaudeIcon, DockerIcon, GitIcon, UpdateAvailableIcon } from '@/components/ActivityBar/ActivityBar'

export interface NotificationItem {
  id: string
  text: string
  disabled: boolean
  icon: ReactNode
  onClick?: () => void
}

export function useNotificationItems(): NotificationItem[] {
  const usageAlerts = useUsageAlertStore((s) => s.alerts)
  const gitRepos = useGitStore((s) => s.repos)
  const dockerEnabled = useDockerSettingsStore((s) => s.enabled)
  const dockerStatus = useDockerStore((s) => s.status)
  const requestDockerOpen = useDockerOffAlertStore((s) => s.requestOpen)
  const available = useUpdateStore((s) => s.available)
  const status = useUpdateStore((s) => s.status)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const restart = useUpdateStore((s) => s.restart)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (usageAlerts.length === 0) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [usageAlerts])

  const items: NotificationItem[] = []

  // Session and weekly can both be at risk at once — each gets its own row
  // (usageAlerts is already sorted soonest-cutoff-first by the store).
  for (const alert of usageAlerts) {
    const scopeLabel = alert.scope === 'session' ? 'Session' : 'Weekly'
    const ranOut = now >= alert.cutoffAt
    const text = ranOut
      ? alert.resetAt != null
        ? `${scopeLabel} usage ran out — resets in ${formatCountdownClock(alert.resetAt, now)}`
        : `${scopeLabel} usage ran out`
      : `${scopeLabel} usage may run out in ${formatCountdownClock(alert.cutoffAt, now)}`
    items.push({
      id: `usage-${alert.scope}`,
      text,
      disabled: false,
      icon: <ClaudeIcon />,
      onClick: () => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false }),
    })
  }

  // A repo's commitError persists in gitStore until the next successful
  // commit (or the message is edited) — same "stays active until the
  // underlying condition clears" shape as the usage/docker/update items
  // above, so it plugs into the same acknowledge/reconcile rules for free.
  for (const [cwd, repoState] of Object.entries(gitRepos)) {
    if (!repoState.commitError) continue
    const repoName = cwd.split('/').pop()
    items.push({
      id: `commit-error-${cwd}`,
      text: `Commit failed in ${repoName}: ${repoState.commitError}`,
      disabled: false,
      icon: <GitIcon />,
      onClick: () => {
        useGitReposStore.getState().selectRepo(cwd)
        useGitPanelOpenAlertStore.getState().requestOpen()
      },
    })
  }

  if (dockerEnabled && dockerStatus === 'stopped') {
    items.push({
      id: 'docker',
      text: "Docker isn't running",
      disabled: false,
      icon: <DockerIcon />,
      onClick: requestDockerOpen,
    })
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
    items.push({ id: 'update', text, disabled: status === 'updating', icon: <UpdateAvailableIcon />, onClick })
  }

  return items
}
