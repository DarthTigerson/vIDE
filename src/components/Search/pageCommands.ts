import type { Command } from './commands'
import { openTab, openGitTab } from './commands'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import {
  GIT_GRAPH_TAB_PATH,
  GIT_LOG_TAB_PATH,
  GIT_BRANCH_DIFF_TAB_PATH,
  GENERAL_SETTINGS_TAB_PATH,
  DISPLAY_TAB_PATH,
  FILE_TREE_SETTINGS_TAB_PATH,
  ABOUT_SETTINGS_TAB_PATH,
  EDITOR_SETTINGS_TAB_PATH,
  GIT_SETTINGS_TAB_PATH,
  BROWSER_SETTINGS_TAB_PATH,
  CLAUDE_SETTINGS_TAB_PATH,
  BRIDGE_SETTINGS_TAB_PATH,
  GRAPHIFY_SETTINGS_TAB_PATH,
  MOBILE_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH,
  NOTES_SETTINGS_TAB_PATH,
  SCRIPTS_SETTINGS_TAB_PATH,
  LLAMA_SETTINGS_TAB_PATH,
  STORE_SETTINGS_TAB_PATH,
  AGENT_TOOLING_SETTINGS_TAB_PATH,
  SOUND_SETTINGS_TAB_PATH,
  USAGE_GRAPH_TAB_PATH,
  ALARMS_TAB_PATH,
  GRAPHIFY_GRAPH_TAB_PATH,
  STORE_TAB_PATH,
  buildAppSettingsPath,
} from '@/components/Settings/paths'
import { useAppContribStore } from '@/apps/appContribStore'
import { useAlarmStore } from '@/stores/alarmStore'

const noAlarmRinging = () => (useAlarmStore.getState().ringing ? null : 'No alarm is ringing')

export interface SettingsPage {
  id: string
  label: string
  path: string
  description?: string
  keywords: string[]
}

// One row per settings://… tab in Settings/paths.ts — a test in
// pageCommands.test.ts fails if a page is added there and not here.
export const SETTINGS_PAGES: SettingsPage[] = [
  { id: 'settings-display', label: 'Settings: Display', path: DISPLAY_TAB_PATH, description: 'Theme, panel style', keywords: ['theme', 'appearance', 'colour', 'color'] },
  { id: 'settings-file-tree', label: 'Settings: Site Tree', path: FILE_TREE_SETTINGS_TAB_PATH, description: 'Git status letters and colours', keywords: ['file tree', 'explorer', 'git', 'status', 'badge', 'decorations'] },
  { id: 'settings-sound', label: 'Settings: Sound & Voice', path: SOUND_SETTINGS_TAB_PATH, description: 'Done sound, speaking mode, voices', keywords: ['sound', 'voice', 'speak', 'speech', 'tts', 'done', 'notification', 'mute'] },
  { id: 'settings-about', label: 'Settings: About', path: ABOUT_SETTINGS_TAB_PATH, description: 'Version, updates, release notes', keywords: ['version', 'update', 'check', 'changelog', 'release', 'notes'] },
  { id: 'settings-editor', label: 'Settings: Editor', path: EDITOR_SETTINGS_TAB_PATH, description: 'Font size, auto-save, autocomplete', keywords: ['font', 'autosave', 'editor', 'autocomplete'] },
  { id: 'settings-git', label: 'Settings: Git', path: GIT_SETTINGS_TAB_PATH, description: 'Remote, identity', keywords: ['remote', 'origin', 'identity'] },
  { id: 'settings-general', label: 'Settings: General', path: GENERAL_SETTINGS_TAB_PATH, keywords: [] },
  { id: 'settings-browser', label: 'Settings: Browser', path: BROWSER_SETTINGS_TAB_PATH, keywords: ['web', 'url', 'search', 'web search'] },
  { id: 'settings-claude', label: 'Settings: Claude', path: CLAUDE_SETTINGS_TAB_PATH, keywords: ['assistant', 'cli'] },
  { id: 'settings-bridge', label: 'Settings: Bridge', path: BRIDGE_SETTINGS_TAB_PATH, keywords: ['local', 'llm', 'openai'] },
  { id: 'settings-graphify', label: 'Settings: Graphify', path: GRAPHIFY_SETTINGS_TAB_PATH, keywords: ['knowledge', 'graph'] },
  { id: 'settings-mobile', label: 'Settings: Mobile', path: MOBILE_SETTINGS_TAB_PATH, keywords: ['phone', 'qr', 'pair'] },
  { id: 'settings-todo', label: 'Settings: Todo', path: TODO_SETTINGS_TAB_PATH, keywords: ['tasks', 'board'] },
  { id: 'settings-notes', label: 'Settings: Notes', path: NOTES_SETTINGS_TAB_PATH, keywords: ['markdown'] },
  { id: 'settings-scripts', label: 'Settings: Scripts', path: SCRIPTS_SETTINGS_TAB_PATH, keywords: ['routine', 'shell', 'mcp'] },
  { id: 'settings-agent-tooling', label: 'Settings: Agent Tooling', path: AGENT_TOOLING_SETTINGS_TAB_PATH, description: 'Tools agents can call, built in and from apps', keywords: ['mcp', 'tools', 'agent', 'search', 'web search'] },
  { id: 'settings-store', label: 'Settings: Store', path: STORE_SETTINGS_TAB_PATH, description: 'Install apps from a file', keywords: ['apps', 'install', 'package', 'zip', 'vsuite'] },
  { id: 'settings-llama', label: 'Settings: Llama', path: LLAMA_SETTINGS_TAB_PATH, keywords: ['local', 'model', 'llm'] },
]

// One row per store app settings page, computed at call time.
function appSettingsPages(): SettingsPage[] {
  return Object.values(useAppContribStore.getState().settingsPages).map((page) => ({
    id: `settings-app-${page.appId}`,
    label: `Settings: ${page.title}`,
    path: buildAppSettingsPath(page.appId),
    keywords: ['app'],
  }))
}

export function pageCommands(): Command[] {
  return [
    {
      id: 'git-graph',
      label: 'Git: Graph',
      description: 'Open the git commit graph',
      keywords: ['commits', 'history', 'log', 'tree'],
      action: () => openGitTab(GIT_GRAPH_TAB_PATH),
    },
    {
      id: 'git-log',
      label: 'Git: Log',
      description: 'Open the git log view',
      keywords: ['commits', 'history'],
      action: () => openTab(GIT_LOG_TAB_PATH),
    },
    {
      id: 'git-branch-diff',
      label: 'Git: Branch Diff',
      description: 'Compare branches',
      keywords: ['compare', 'diff', 'branch'],
      action: () => openGitTab(GIT_BRANCH_DIFF_TAB_PATH),
    },
    ...[...SETTINGS_PAGES, ...appSettingsPages()].map((page): Command => ({
      id: page.id,
      label: page.label,
      description: page.description,
      keywords: page.keywords,
      action: () => openTab(page.path),
    })),
    {
      id: 'view-usage-graph',
      label: 'View: Usage Graph',
      description: 'Open the usage graph',
      keywords: ['usage', 'stats'],
      action: () => openTab(USAGE_GRAPH_TAB_PATH),
    },
    {
      id: 'view-store',
      label: 'View: Store',
      description: 'Browse and install vIDE apps',
      keywords: ['store', 'apps', 'install', 'vsuite', 'plugins', 'extensions'],
      action: () => openTab(STORE_TAB_PATH),
    },
    {
      id: 'view-alarms',
      label: 'View: Alarms',
      description: 'Silent alarms — also opens from the footer clock',
      keywords: ['alarm', 'clock', 'reminder', 'timer', 'snooze'],
      action: () => openTab(ALARMS_TAB_PATH),
    },
    {
      id: 'alarm-snooze',
      label: 'Alarm: Snooze',
      description: 'Snooze the ringing alarm for 9 minutes',
      keywords: ['alarm', 'snooze', 'later'],
      disabledReason: noAlarmRinging,
      action: () => useAlarmStore.getState().snooze(),
    },
    {
      id: 'alarm-stop',
      label: 'Alarm: Stop',
      description: 'Stop the ringing alarm',
      keywords: ['alarm', 'stop', 'dismiss'],
      disabledReason: noAlarmRinging,
      action: () => useAlarmStore.getState().stop(),
    },
    {
      id: 'view-graphify-graph',
      label: 'View: Graphify Graph',
      description: 'Open the knowledge graph',
      keywords: ['graphify', 'knowledge'],
      disabledReason: () => (useGraphifySettingsStore.getState().enabled ? null : 'Enable Graphify in Settings'),
      action: () => openTab(GRAPHIFY_GRAPH_TAB_PATH),
    },
    {
      id: 'view-todo-board',
      label: 'View: Todo Board',
      description: 'Open the Todo panel (reopens your last board)',
      keywords: ['tasks', 'kanban'],
      action: () => usePanelRequestStore.getState().requestPanel('todos'),
    },
    {
      id: 'view-notes',
      label: 'View: Notes',
      description: 'Open the Notes panel',
      keywords: ['markdown'],
      action: () => usePanelRequestStore.getState().requestPanel('notes'),
    },
    {
      id: 'view-scripts',
      label: 'View: Scripts',
      description: 'Open the Scripts panel',
      keywords: ['routine', 'shell'],
      action: () => usePanelRequestStore.getState().requestPanel('scripts'),
    },
    {
      id: 'app-reload-window',
      label: 'App: Reload Window',
      description: 'Reload this vIDE window',
      keywords: ['refresh', 'reload'],
      action: () => window.location.reload(),
    },
    {
      id: 'app-restart',
      label: 'App: Restart vIDE',
      description: 'Restart every vIDE window',
      keywords: ['relaunch', 'restart', 'frozen', 'recover'],
      action: () => window.api.restartApp(),
    },
  ]
}
