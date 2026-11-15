import { createElement } from 'react'
import type { AppInfo } from '../../electron/apps/appTypes'
import type { AllAppsEntry } from '@/components/AllApps/AllAppsPanel'
import { StoreBagIcon } from '@/components/Store/storeUi'
import type { PanelContrib, SettingsContrib } from './appContribStore'

export interface StoreAppItemsInput {
  apps: AppInfo[]
  runtimeErrors: Record<string, string>
  panels: Record<string, PanelContrib>
  settingsPages: Record<string, SettingsContrib>
  projectOpen: boolean
  openPanel: (appId: string) => void
  openSettings: (appId: string) => void
  uninstall: (appId: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

// All Apps rows for installed store apps, appended after the built-ins. They
// are never favoritable in phase 1. A failed app is listed inert with its
// error as a tooltip; a panel that needs a project is hidden without one.
export function buildStoreAppEntries(input: StoreAppItemsInput): AllAppsEntry[] {
  const entries: AllAppsEntry[] = []
  for (const app of input.apps) {
    const panel = input.panels[app.id]
    const hasSettings = !!input.settingsPages[app.id]
    const error = input.runtimeErrors[app.id] ?? (app.status === 'failed' ? app.error ?? 'Failed to load' : undefined)
    const base = {
      id: app.id,
      title: app.name,
      favorite: false,
      favoritable: false,
      onSettings: () => input.openSettings(app.id),
      onUninstall: () => input.uninstall(app.id),
    }
    const fallbackIcon = createElement(StoreBagIcon, { size: 16 })
    if (error) {
      entries.push({ ...base, icon: fallbackIcon, subtitle: 'Failed to load', tooltip: error })
      continue
    }
    if (panel?.requiresProject && !input.projectOpen) continue
    const icon = panel ? createElement(panel.icon) : fallbackIcon
    const restart = app.status === 'restart-required'
    entries.push({
      ...base,
      icon,
      badge: panel?.badge,
      subtitle: restart ? 'Restart to finish' : undefined,
      onOpen: panel ? () => input.openPanel(app.id) : hasSettings ? () => input.openSettings(app.id) : undefined,
    })
  }
  return entries
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
