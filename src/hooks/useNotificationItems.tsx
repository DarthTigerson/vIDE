import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { COMMIT_MESSAGE_LOGIN_ERROR, useGitStore } from '@/stores/gitStore'
import { startClaudeLogin } from '@/lib/claudeLogin'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitPanelOpenAlertStore } from '@/stores/gitPanelOpenAlertStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { formatCountdownClock } from '@/components/UsagePanel/format'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH, STORE_TAB_PATH, buildStoreAppPath } from '@/components/Settings/paths'
import { useAppContribStore } from '@/apps/appContribStore'
import { StoreBagIcon } from '@/components/Store/storeUi'
import { useStoreStore, startStoreUpdates, findStoreApp } from '@/stores/storeStore'
import { MOVED_NOTICE_ID, movedApps, pendingUpdates, readLocalKey, updateNoticeId } from '@/lib/storeUpdates'
import { ClaudeIcon, GitIcon, GraphIcon, LlamaIcon, UpdateAvailableIcon } from '@/components/ActivityBar/ActivityBar'

export interface NotificationItem {
  id: string
  text: string
  disabled: boolean
  icon: ReactNode
  onClick?: () => void
  // A small button at the row's right, before the x (e.g. Restart vIDE).
  action?: { label: string; onClick: () => void }
  // A quieter button before `action` (e.g. Snooze).
  secondaryAction?: { label: string; onClick: () => void }
  // Stays in the peek, without the drain countdown, until it's seen (its ×
  // or closing the panel on it) or its condition clears.
  pinned?: boolean
  // Shown in red, and can't be acknowledged or dismissed: it stays until its
  // condition clears (e.g. an urgent update gets installed or snoozed).
  urgent?: boolean
  // Extra work when the panel's x / Dismiss all clears this row (e.g. persisting it).
  onDismiss?: () => void
}

export function useNotificationItems(): NotificationItem[] {
  const usageAlerts = useUsageAlertStore((s) => s.alerts)
  const gitRepos = useGitStore((s) => s.repos)
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
  const snoozedVersion = useUpdateStore((s) => s.snoozedVersion)
  const snooze = useUpdateStore((s) => s.snooze)

  const appNotifications = useAppContribStore((s) => s.notifications)
  const installedApps = useAppContribStore((s) => s.apps)
  const storeRegistry = useStoreStore((s) => s.registry)
  const dismissedUpdates = useStoreStore((s) => s.dismissedUpdates)
  const storeErrors = useStoreStore((s) => s.errors)
  const storeEvents = useStoreStore((s) => s.events)
  const movedNoticeDismissed = useStoreStore((s) => s.movedNoticeDismissed)

  // The bell needs the catalog even when the Store tab was never opened.
  useEffect(() => {
    startStoreUpdates()
  }, [])

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
  // underlying condition clears" shape as the usage/update items
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
  // An expired login gets its own row: clicking it (or Log in) opens a Claude
  // session that runs /login.
  for (const [cwd, repoState] of Object.entries(gitRepos)) {
    if (!repoState.commitMessageError) continue
    if (repoState.commitMessageError === COMMIT_MESSAGE_LOGIN_ERROR) {
      items.push({
        id: `commit-message-error-${cwd}`,
        text: COMMIT_MESSAGE_LOGIN_ERROR,
        disabled: false,
        icon: <ClaudeIcon />,
        onClick: startClaudeLogin,
        action: { label: 'Log in', onClick: startClaudeLogin },
      })
      continue
    }
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

  // Pinned in the peek until handled. Urgent and critical releases (see
  // electron/updateChecker.ts) are red, can't be closed, and only offer
  // Snooze; snoozing drops the row for an hour, and its return counts as a
  // new arrival, so the bell rings and the peek pins it again.
  const snoozed = !!available && snoozedVersion === available.version
  if (available && !snoozed) {
    const urgent = available.severity !== 'normal' && status !== 'updating'
    const idleText =
      available.severity === 'critical'
        ? `Critical security update: vIDE v${available.version}`
        : available.severity === 'urgent'
          ? `Security update: vIDE v${available.version}`
          : `vIDE v${available.version} is available`
    const text =
      status === 'ready'
        ? 'Update installed — restart to finish'
        : status === 'updating'
          ? 'Updating vIDE…'
          : status === 'failed'
            ? `Update failed — v${available.version} available`
            : idleText
    const action =
      status === 'ready'
        ? { label: 'Restart', onClick: restart }
        : status === 'failed'
          ? { label: 'Retry', onClick: startUpdate }
          : status === 'idle'
            ? { label: 'Update', onClick: startUpdate }
            : undefined
    // The row itself opens the Update page (VIDE-142): what's new, or the
    // progress of an update already running.
    items.push({
      id: 'update',
      text,
      disabled: false,
      icon: <UpdateAvailableIcon />,
      onClick: status === 'ready' ? restart : openUpdatePage,
      action,
      secondaryAction: urgent ? { label: 'Snooze', onClick: snooze } : undefined,
      pinned: status !== 'updating',
      urgent,
    })
  }

  // Notifications registered by store apps (vide.notifications.add).
  for (const n of appNotifications) {
    items.push({
      id: `app-${n.appId}-${n.id}`,
      text: n.text,
      disabled: false,
      icon: <StoreBagIcon size={16} />,
      onClick: n.onClick,
    })
  }

  // One notice per app version; click installs it, x silences that version.
  for (const u of pendingUpdates(storeRegistry, installedApps, dismissedUpdates)) {
    const noticeId = updateNoticeId(u.id, u.version)
    items.push({
      id: noticeId,
      text: storeErrors[u.id] ? `Couldn't update ${u.name}: ${storeErrors[u.id]}` : `${u.name} ${u.version} is available`,
      disabled: false,
      icon: <StoreBagIcon size={16} />,
      onClick: () => void useStoreStore.getState().install(u.id),
      onDismiss: () => useStoreStore.getState().dismissUpdate(noticeId),
    })
  }

  // Built-ins that moved to the Store and were enabled here: click opens the
  // install list; x dismisses it for good (see storeStore.dismissMovedNotice).
  if (movedApps(storeRegistry, installedApps, readLocalKey, movedNoticeDismissed).length > 0) {
    items.push({
      id: MOVED_NOTICE_ID,
      text: 'Some apps moved to the Store',
      disabled: false,
      icon: <StoreBagIcon size={16} />,
      onClick: () => useStoreStore.getState().setMovedNoticeOpen(true),
      onDismiss: () => useStoreStore.getState().dismissMovedNotice(),
    })
  }

  // Install results: one item per event, so each peeks once; x removes it.
  // A successful install opens that app's Store page (the Store itself when
  // the app isn't listed, e.g. installed from a file), and offers a restart
  // while the update is waiting on one (an app whose main process was running).
  for (const ev of storeEvents) {
    const appId = ev.appId
    const needsRestart = !!appId && installedApps.some((a) => a.id === appId && a.status === 'restart-required')
    items.push({
      id: ev.id,
      text: ev.text,
      disabled: false,
      icon: <StoreBagIcon size={16} />,
      onClick: appId
        ? () => {
            const path = findStoreApp(useStoreStore.getState().registry, appId) ? buildStoreAppPath(appId) : STORE_TAB_PATH
            useEditorStore.getState().openTab({ path, content: '', dirty: false })
          }
        : undefined,
      action: needsRestart ? { label: 'Restart vIDE', onClick: () => void window.api.appsRestart() } : undefined,
      onDismiss: () => useStoreStore.getState().dismissEvent(ev.id),
    })
  }

  return items
}
