import { useEditorStore } from '@/stores/editorStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import { getBiggestPaneId } from '@/lib/paneLayout'
import { isMac } from '@/lib/platform'
import {
  GIT_GRAPH_TAB_PATH,
  GIT_BRANCH_DIFF_TAB_PATH,
  DISPLAY_TAB_PATH,
  EDITOR_SETTINGS_TAB_PATH,
  GIT_SETTINGS_TAB_PATH,
  buildTerminalPath,
} from '@/components/Settings/paths'
import { GIT_LOG_TAB_PATH } from '@/components/Settings/paths'

export interface Command {
  id: string
  label: string
  description?: string
  keywords?: string[]
  condition?: () => boolean
  action: () => void
  // Shown as a muted hint on the right, for commands that have a known
  // keyboard shortcut - left unset for the ones that don't.
  shortcut?: string
}

function openTab(path: string) {
  useEditorStore.getState().openTab({ path, content: '', dirty: false })
}

// Shared by the Git Graph and Git Branch Diff commands — mirrors the
// "open in biggest pane" pattern used elsewhere for these tabs.
function openGitTab(path: string) {
  const tab = { path, content: '', dirty: false }
  if (useGitSettingsStore.getState().openInBiggestPane) {
    const biggestPaneId = getBiggestPaneId()
    if (biggestPaneId) {
      useEditorStore.getState().openTabInPane(tab, biggestPaneId)
      return
    }
  }
  useEditorStore.getState().openTab(tab)
}

export const COMMANDS: Command[] = [
  {
    id: 'new-terminal',
    label: 'New Terminal',
    description: 'Open a terminal tab in the active pane',
    keywords: ['shell', 'bash', 'zsh', 'console'],
    shortcut: isMac ? '⌘T' : 'Ctrl+T',
    action: () => {
      const id = Date.now().toString(36)
      openTab(buildTerminalPath(id))
    },
  },
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
  {
    id: 'settings-display',
    label: 'Settings: Display',
    description: 'Theme, panel style',
    keywords: ['theme', 'appearance', 'colour', 'color'],
    action: () => openTab(DISPLAY_TAB_PATH),
  },
  {
    id: 'settings-editor',
    label: 'Settings: Editor',
    description: 'Font size, auto-save',
    keywords: ['font', 'autosave', 'editor'],
    action: () => openTab(EDITOR_SETTINGS_TAB_PATH),
  },
  {
    id: 'settings-git',
    label: 'Settings: Git',
    description: 'Remote, identity',
    keywords: ['remote', 'origin', 'identity'],
    action: () => openTab(GIT_SETTINGS_TAB_PATH),
  },
  {
    id: 'switch-to-claude',
    label: 'Switch to Claude',
    description: 'Use Claude Code as the AI assistant',
    keywords: ['assistant', 'model'],
    condition: () => useClaudeStore.getState().assistant !== 'claude',
    action: () => useClaudeStore.getState().setAssistant('claude'),
  },
  {
    id: 'switch-to-bridge',
    label: 'Switch to Bridge',
    description: 'Use Bridge as the AI assistant',
    keywords: ['assistant', 'model'],
    condition: () => useClaudeStore.getState().assistant !== 'bridge',
    action: () => useClaudeStore.getState().setAssistant('bridge'),
  },
]
