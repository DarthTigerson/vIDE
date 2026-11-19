import { create } from 'zustand'
import type { ComponentType } from 'react'
import type { AppInfo } from '../../electron/apps/appTypes'
import type { Command } from '@/components/Search/commands'
import type { Json } from './videApiTypes'

export interface PanelContrib { appId: string; title: string; icon: ComponentType; component: ComponentType; requiresProject: boolean; badge?: number | string }
export interface SettingsContrib { appId: string; title: string; component: ComponentType }
export interface TabKindContrib { appId: string; kind: string; title: (p: Json) => string; component: ComponentType<{ params: Json }> }
export interface CommandContrib { appId: string; command: Command }
export interface NotificationContrib { appId: string; id: string; text: string; onClick?: () => void }
// An activity-bar button that runs an action instead of opening a panel (one per app).
export interface LauncherContrib { appId: string; title: string; icon: ComponentType; onClick: () => void; visible: boolean; active: boolean }
export type LauncherPatch = Partial<Pick<LauncherContrib, 'title' | 'icon' | 'visible' | 'active'>>

interface AppContribState {
  apps: AppInfo[]
  runtimeErrors: Record<string, string>
  // Panels and settings pages are keyed by appId, tab kinds by `${appId}/${kind}`.
  panels: Record<string, PanelContrib>
  settingsPages: Record<string, SettingsContrib>
  tabKinds: Record<string, TabKindContrib>
  commands: CommandContrib[]
  notifications: NotificationContrib[]
  launchers: Record<string, LauncherContrib>
  // Bumped by vide.ui.closeSidePanel(); App closes the left side panel.
  sidePanelCloseRequest: number
  // Set by vide.ui.openPanel(); App reads it and opens the app's panel.
  panelRequest: { appId: string; seq: number } | null

  setApps(apps: AppInfo[]): void
  clearApp(appId: string): void
  setRuntimeError(appId: string, msg: string | null): void
  requestPanel(appId: string): void
  requestSidePanelClose(): void

  registerPanel(p: PanelContrib): void
  unregisterPanel(appId: string): void
  setPanelBadge(appId: string, badge?: number | string): void
  registerSettingsPage(p: SettingsContrib): void
  unregisterSettingsPage(appId: string): void
  registerTabKind(p: TabKindContrib): void
  unregisterTabKind(appId: string, kind: string): void
  registerCommand(c: CommandContrib): void
  unregisterCommand(commandId: string): void
  registerNotification(n: NotificationContrib): void
  unregisterNotification(appId: string, id: string): void
  registerLauncher(l: LauncherContrib): void
  updateLauncher(appId: string, patch: LauncherPatch): void
  unregisterLauncher(appId: string): void
}

function omitKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = rec
  void _removed
  return rest
}

function omitApp<T extends { appId: string }>(rec: Record<string, T>, appId: string): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).filter(([, v]) => v.appId !== appId))
}

export const useAppContribStore = create<AppContribState>((set) => ({
  apps: [],
  runtimeErrors: {},
  panels: {},
  settingsPages: {},
  tabKinds: {},
  commands: [],
  notifications: [],
  launchers: {},
  sidePanelCloseRequest: 0,
  panelRequest: null,

  setApps: (apps) => set({ apps }),
  clearApp: (appId) =>
    set((s) => ({
      panels: omitApp(s.panels, appId),
      settingsPages: omitApp(s.settingsPages, appId),
      tabKinds: omitApp(s.tabKinds, appId),
      commands: s.commands.filter((c) => c.appId !== appId),
      notifications: s.notifications.filter((n) => n.appId !== appId),
      launchers: omitKey(s.launchers, appId),
      runtimeErrors: omitKey(s.runtimeErrors, appId),
    })),
  setRuntimeError: (appId, msg) =>
    set((s) => ({ runtimeErrors: msg === null ? omitKey(s.runtimeErrors, appId) : { ...s.runtimeErrors, [appId]: msg } })),
  requestSidePanelClose: () => set((s) => ({ sidePanelCloseRequest: s.sidePanelCloseRequest + 1 })),
  requestPanel: (appId) => set((s) => ({ panelRequest: { appId, seq: (s.panelRequest?.seq ?? 0) + 1 } })),

  registerPanel: (p) => set((s) => ({ panels: { ...s.panels, [p.appId]: p } })),
  unregisterPanel: (appId) => set((s) => ({ panels: omitKey(s.panels, appId) })),
  setPanelBadge: (appId, badge) =>
    set((s) => (s.panels[appId] ? { panels: { ...s.panels, [appId]: { ...s.panels[appId], badge } } } : s)),
  registerSettingsPage: (p) => set((s) => ({ settingsPages: { ...s.settingsPages, [p.appId]: p } })),
  unregisterSettingsPage: (appId) => set((s) => ({ settingsPages: omitKey(s.settingsPages, appId) })),
  registerTabKind: (p) => set((s) => ({ tabKinds: { ...s.tabKinds, [`${p.appId}/${p.kind}`]: p } })),
  unregisterTabKind: (appId, kind) => set((s) => ({ tabKinds: omitKey(s.tabKinds, `${appId}/${kind}`) })),
  registerCommand: (c) => set((s) => ({ commands: [...s.commands.filter((x) => x.command.id !== c.command.id), c] })),
  unregisterCommand: (id) => set((s) => ({ commands: s.commands.filter((x) => x.command.id !== id) })),
  registerNotification: (n) =>
    set((s) => ({ notifications: [...s.notifications.filter((x) => !(x.appId === n.appId && x.id === n.id)), n] })),
  unregisterNotification: (appId, id) =>
    set((s) => ({ notifications: s.notifications.filter((x) => !(x.appId === appId && x.id === id)) })),
  registerLauncher: (l) => set((s) => ({ launchers: { ...s.launchers, [l.appId]: l } })),
  updateLauncher: (appId, patch) =>
    set((s) => (s.launchers[appId] ? { launchers: { ...s.launchers, [appId]: { ...s.launchers[appId], ...patch } } } : s)),
  unregisterLauncher: (appId) => set((s) => ({ launchers: omitKey(s.launchers, appId) })),
}))
