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
  EDITOR_SETTINGS_TAB_PATH,
  GIT_SETTINGS_TAB_PATH,
  BROWSER_SETTINGS_TAB_PATH,
  CLAUDE_SETTINGS_TAB_PATH,
  BRIDGE_SETTINGS_TAB_PATH,
  GRAPHIFY_SETTINGS_TAB_PATH,
  JIRA_SETTINGS_TAB_PATH,
  DOCKER_SETTINGS_TAB_PATH,
  MOBILE_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH,
  NOTES_SETTINGS_TAB_PATH,
  LLAMA_SETTINGS_TAB_PATH,
  USAGE_GRAPH_TAB_PATH,
  GRAPHIFY_GRAPH_TAB_PATH,
} from '@/components/Settings/paths'

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
  { id: 'settings-editor', label: 'Settings: Editor', path: EDITOR_SETTINGS_TAB_PATH, description: 'Font size, auto-save', keywords: ['font', 'autosave', 'editor'] },
  { id: 'settings-git', label: 'Settings: Git', path: GIT_SETTINGS_TAB_PATH, description: 'Remote, identity', keywords: ['remote', 'origin', 'identity'] },
  { id: 'settings-general', label: 'Settings: General', path: GENERAL_SETTINGS_TAB_PATH, keywords: [] },
  { id: 'settings-browser', label: 'Settings: Browser', path: BROWSER_SETTINGS_TAB_PATH, keywords: ['web', 'url'] },
  { id: 'settings-claude', label: 'Settings: Claude', path: CLAUDE_SETTINGS_TAB_PATH, keywords: ['assistant', 'cli'] },
  { id: 'settings-bridge', label: 'Settings: Bridge', path: BRIDGE_SETTINGS_TAB_PATH, keywords: ['local', 'llm', 'openai'] },
  { id: 'settings-graphify', label: 'Settings: Graphify', path: GRAPHIFY_SETTINGS_TAB_PATH, keywords: ['knowledge', 'graph'] },
  { id: 'settings-jira', label: 'Settings: Jira', path: JIRA_SETTINGS_TAB_PATH, keywords: ['tickets', 'issues'] },
  { id: 'settings-docker', label: 'Settings: Docker', path: DOCKER_SETTINGS_TAB_PATH, keywords: ['containers'] },
  { id: 'settings-mobile', label: 'Settings: Mobile', path: MOBILE_SETTINGS_TAB_PATH, keywords: ['phone', 'qr', 'pair'] },
  { id: 'settings-todo', label: 'Settings: Todo', path: TODO_SETTINGS_TAB_PATH, keywords: ['tasks', 'board'] },
  { id: 'settings-notes', label: 'Settings: Notes', path: NOTES_SETTINGS_TAB_PATH, keywords: ['markdown'] },
  { id: 'settings-llama', label: 'Settings: Llama', path: LLAMA_SETTINGS_TAB_PATH, keywords: ['local', 'model', 'llm'] },
]

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
    ...SETTINGS_PAGES.map((page): Command => ({
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
  ]
}
