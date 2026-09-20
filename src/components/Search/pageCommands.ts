import type { Command } from './commands'
import { openTab, openGitTab } from './commands'
import {
  GIT_GRAPH_TAB_PATH,
  GIT_LOG_TAB_PATH,
  GIT_BRANCH_DIFF_TAB_PATH,
  DISPLAY_TAB_PATH,
  EDITOR_SETTINGS_TAB_PATH,
  GIT_SETTINGS_TAB_PATH,
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
  ]
}
