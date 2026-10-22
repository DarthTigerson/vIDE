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
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { formatCountdownClock } from '@/components/UsagePanel/format'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { ClaudeIcon, DockerIcon, GitIcon, GraphIcon, LlamaIcon, UpdateAvailableIcon } from '@/components/ActivityBar/ActivityBar'

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
  const llamaEnabled = useLlamaSettingsStore((s) => s.enabled)
  const llamaAvailable = useLlamaStore((s) => s.available)
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  const graphifyGitignorePrompt = useGraphifySettingsStore((s) => s.gitignorePrompt)
  const graphifyGitignorePrompts = useGraphifyStore((s) => s.gitignorePrompts)
  const graphifyClaudeSkillPrompt = useGraphifySettingsStore((s) => s.claudeSkillPrompt)
  const graphifyClaudeSkillPrompts = useGraphifyStore((s) => s.claudeSkillPrompts)
  const graphifyInstallingSkill = useGraphifyStore((s) => s.installingSkill)
  const available = useUpdateStore((s) => s.available)
  const status = useUpdateStore((s) => s.status)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const openUpdatePage = useUpdateStore((s) => s.openUpdatePage)
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

  // Same shape as the commit-error rows above: lives in gitStore until the
  // message is edited, a commit succeeds, or the next generation starts.
  for (const [cwd, repoState] of Object.entries(gitRepos)) {
    if (!repoState.commitMessageError) continue
    const repoName = cwd.split('/').pop()
    items.push({
      id: `commit-message-error-${cwd}`,
      text: `${repoState.commitMessageError} in ${repoName}`,
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

  // null means "not probed yet" — only a confirmed false is worth telling the
  // user about. Clicking opens the Llama panel, which shows how to install it.
  if (llamaEnabled && llamaAvailable === false) {
    items.push({
      id: 'llama-unavailable',
      text: "llama.cpp isn't installed",
      disabled: false,
      icon: <LlamaIcon />,
      onClick: () => usePanelRequestStore.getState().requestPanel('llama'),
    })
  }

  // Click applies (adds graphify-out/ to .gitignore); × closes it. Stays until
  // the repo ignores graphify-out/ and the next check clears it.
  if (graphifyEnabled && graphifyGitignorePrompt) {
    for (const [cwd, error] of Object.entries(graphifyGitignorePrompts)) {
      const repoName = cwd.split('/').pop()
      items.push({
        id: `graphify-gitignore-${cwd}`,
        text: error
          ? `Couldn't add graphify-out/ to .gitignore in ${repoName}: ${error}`
          : `graphify-out/ isn't in ${repoName}'s .gitignore — click to add it`,
        disabled: false,
        icon: <GraphIcon />,
        onClick: () => useGraphifyStore.getState().addToGitignore(cwd),
      })
    }
  }

  // Click applies (installs graphify's Claude Code skill for the repo); ×
  // closes it. Disabled while that install runs.
  if (graphifyEnabled && graphifyClaudeSkillPrompt) {
    for (const [cwd, error] of Object.entries(graphifyClaudeSkillPrompts)) {
      const repoName = cwd.split('/').pop()
      const installing = graphifyInstallingSkill === cwd
      items.push({
        id: `graphify-claude-skill-${cwd}`,
        text: installing
          ? `Setting up graphify for Claude Code in ${repoName}…`
          : error
            ? `Couldn't set up graphify for Claude Code in ${repoName}: ${error}`
            : `Claude Code isn't using graphify in ${repoName} — click to set it up`,
        disabled: installing,
        icon: <GraphIcon />,
        onClick: () => useGraphifyStore.getState().installClaudeSkill(cwd),
      })
    }
  }

  if (available) {
    const text =
      status === 'ready'
        ? 'Update installed — click to restart'
        : status === 'updating'
          ? 'Updating vIDE…'
          : status === 'failed'
            ? `Update failed — click to retry (v${available.version} available)`
            : `vIDE v${available.version} is available — click to update`
    // Updating: reopen the Update page (VIDE-142) to watch its progress.
    const onClick = status === 'ready' ? restart : status === 'updating' ? openUpdatePage : startUpdate
    items.push({ id: 'update', text, disabled: false, icon: <UpdateAvailableIcon />, onClick })
  }

  return items
}
