import { createElement } from 'react'
import type { AppInfo } from '../../electron/apps/appTypes'
import type { AllAppsEntry, DisabledAppEntry } from '@/components/AllApps/AllAppsPanel'
import { StoreBagIcon } from '@/components/Store/storeUi'
import type { ActivityBarItem } from '@/components/ActivityBar/ActivityBar'
import type { LauncherContrib, PanelContrib, SettingsContrib, UsageViewContrib } from './appContribStore'
import type { RegistryState } from '@/types/api'

// Usage views (gauges) are display tools, not apps: they are in use while the
// usage panel shows them and removed by uninstalling from the Store, so All
// Apps never lists them, not even as disabled or failed. Known by the Store
// listing's 'usage' category, or, for an app installed from a file, by the
// view it registered.
export function isUsageViewApp(
  appId: string,
  registry: RegistryState | null,
  usageViews: Record<string, UsageViewContrib>
): boolean {
  if (usageViews[appId]) return true
  return registry?.status === 'ok' && registry.apps.some((a) => a.id === appId && a.category === 'usage')
}

export interface StoreAppItemsInput {
  apps: AppInfo[]
  runtimeErrors: Record<string, string>
  panels: Record<string, PanelContrib>
  settingsPages: Record<string, SettingsContrib>
  // Apps with an activity-bar launcher instead of a panel (a panel wins if both).
  launchers?: Record<string, LauncherContrib>
  // Usage views (see isUsageViewApp), left out of the list.
  isUsageView?: (appId: string) => boolean
  projectOpen: boolean
  // Favorite ids (`app:<appId>` for store apps); a store app listed here shows a filled star.
  favorites?: readonly string[]
  openPanel: (appId: string) => void
  openSettings: (appId: string) => void
  uninstall: (appId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  // Switches an installed app off (or back on); see AppHost.setEnabled.
  setEnabled?: (appId: string, enabled: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
}

// All Apps rows for installed store apps, appended after the built-ins. They
// are favoritable by their `app:<appId>` id. A failed app is listed inert with its
// error as a tooltip; a panel that needs a project is hidden without one.
export function buildStoreAppEntries(input: StoreAppItemsInput): AllAppsEntry[] {
  const entries: AllAppsEntry[] = []
  for (const app of input.apps) {
    // A switched-off app is listed in the Disabled section instead.
    if (app.status === 'disabled' || input.isUsageView?.(app.id)) continue
    const panel = input.panels[app.id]
    const launcher = panel ? undefined : input.launchers?.[app.id]
    const hasSettings = !!input.settingsPages[app.id]
    const error = input.runtimeErrors[app.id] ?? (app.status === 'failed' ? app.error ?? 'Failed to load' : undefined)
    const base = {
      id: `app:${app.id}`,
      title: app.name,
      favorite: (!!panel || !!launcher) && (input.favorites ?? []).includes(`app:${app.id}`),
      favoritable: !!panel || !!launcher,
      onSettings: () => input.openSettings(app.id),
      onUninstall: () => input.uninstall(app.id),
      onDisable: app.source !== 'dev' && input.setEnabled ? () => { void input.setEnabled!(app.id, false) } : undefined,
    }
    const fallbackIcon = createElement(StoreBagIcon, { size: 16 })
    if (error) {
      entries.push({ ...base, icon: fallbackIcon, subtitle: 'Failed to load', tooltip: error })
      continue
    }
    if (panel?.requiresProject && !input.projectOpen) continue
    const icon = panel ? createElement(panel.icon) : launcher ? createElement(launcher.icon) : fallbackIcon
    const restart = app.status === 'restart-required'
    entries.push({
      ...base,
      icon,
      badge: panel?.badge,
      subtitle: restart ? 'Restart to finish' : undefined,
      onOpen: panel ? () => input.openPanel(app.id) : launcher ? () => launcher.onClick() : hasSettings ? () => input.openSettings(app.id) : undefined,
    })
  }
  return entries
}

// Disabled-section rows for switched-off store apps: Enable (click) and Uninstall.
export function buildStoreDisabledEntries(input: {
  apps: AppInfo[]
  setEnabled: (appId: string, enabled: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
  uninstall: (appId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  isUsageView?: (appId: string) => boolean
}): DisabledAppEntry[] {
  return input.apps
    .filter((app) => app.status === 'disabled' && !input.isUsageView?.(app.id))
    .map((app) => ({
      id: `app:${app.id}`,
      title: app.name,
      icon: createElement(StoreBagIcon, { size: 16 }),
      onEnable: () => { void input.setEnabled(app.id, true) },
      onUninstall: () => input.uninstall(app.id),
    }))
}

// Activity-bar items for installed store apps that have a sidebar panel or a
// visible launcher, keyed by their `app:<appId>` favorite id. A failed app or a project-bound
// panel without a project has none (so a favorited slot simply isn't shown).
export function buildStoreAppBarItems(input: {
  apps: AppInfo[]
  runtimeErrors: Record<string, string>
  panels: Record<string, PanelContrib>
  launchers?: Record<string, LauncherContrib>
  projectOpen: boolean
  activePanel: string | null
  togglePanel: (appId: string) => void
}): Record<string, ActivityBarItem> {
  const items: Record<string, ActivityBarItem> = {}
  for (const app of input.apps) {
    const panel = input.panels[app.id]
    if (input.runtimeErrors[app.id] || app.status === 'failed') continue
    const id = `app:${app.id}`
    if (!panel) {
      const launcher = input.launchers?.[app.id]
      if (launcher?.visible) {
        items[id] = { id, icon: createElement(launcher.icon), title: launcher.title, active: launcher.active, onClick: () => launcher.onClick() }
      }
      continue
    }
    if (panel.requiresProject && !input.projectOpen) continue
    items[id] = {
      id,
      icon: createElement(panel.icon),
      title: app.name,
      active: input.activePanel === id,
      badge: panel.badge,
      onClick: () => input.togglePanel(app.id),
    }
  }
  return items
}

// Whether a store app's sidebar panel should be left when the project closes:
// its panel is gone, or it needs a project.
export function storeAppPanelLeavesOnProjectClose(leftPanel: string | null, panels: Record<string, PanelContrib>): boolean {
  if (!leftPanel || !leftPanel.startsWith('app:')) return false
  const panel = panels[leftPanel.slice(4)]
  return !panel || panel.requiresProject
}

// The sidebar panel a vide.ui.openPanel() request asks for.
export function panelForRequest(req: { appId: string } | null): `app:${string}` | null {
  return req ? `app:${req.appId}` : null
}

// True when any store-app row carries a badge (All Apps shows a dot for it).
export function storeEntriesHaveBadge(entries: AllAppsEntry[]): boolean {
  return entries.some((e) => e.badge !== undefined && e.badge !== '' && e.badge !== 0)
}
