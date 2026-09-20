import type { Command } from './commands'
import { openTab } from './commands'
import { useClaudeStore } from '@/stores/claudeStore'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { openNewBrowserTab } from '@/lib/openBrowserTab'
import { isMac } from '@/lib/platform'
import { buildTerminalPath } from '@/components/Settings/paths'

const NO_PROJECT = 'Open a project first'

function projectRoot(): string | null {
  return useFileStore.getState().projectRoot
}

// Same repo GraphifyPanel builds: the selected repo, or the project root
// when the project has no git repos.
function graphifyCwd(): string | null {
  return useGitReposStore.getState().selectedRepo ?? projectRoot()
}

export function panelCommands(): Command[] {
  return [
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
    {
      id: 'claude-new-session',
      label: 'Claude: New Session',
      description: 'Start another Claude Code session',
      keywords: ['new', 'panel', 'chat', 'assistant'],
      disabledReason: () => (projectRoot() ? null : NO_PROJECT),
      action: () => {
        const root = projectRoot()
        if (!root) return
        const claude = useClaudeStore.getState()
        if (claude.assistant !== 'claude') claude.setAssistant('claude')
        claude.newSession(root)
        claude.setChatVisible(true)
      },
    },
    {
      id: 'bridge-new-session',
      label: 'Bridge: New Session',
      description: 'Start a fresh Bridge conversation',
      keywords: ['new', 'panel', 'chat', 'assistant', 'local'],
      disabledReason: () => (projectRoot() ? null : NO_PROJECT),
      action: () => {
        if (!projectRoot()) return
        const claude = useClaudeStore.getState()
        if (claude.assistant !== 'bridge') claude.setAssistant('bridge')
        useBridgeStore.getState().newSession()
        claude.setChatVisible(true)
      },
    },
    {
      id: 'browser-new-tab',
      label: 'Browser: New Tab',
      description: 'Open a new browser tab',
      keywords: ['web', 'url', 'new'],
      action: () => openNewBrowserTab(),
    },
    {
      id: 'graphify-rebuild',
      label: 'Graphify: Rebuild',
      description: 'Update the knowledge graph for this repo',
      keywords: ['graph', 'update', 'index'],
      disabledReason: () => {
        if (!useGraphifySettingsStore.getState().enabled) return 'Enable Graphify in Settings'
        const graphify = useGraphifyStore.getState()
        if (graphify.available === false) return 'graphify is not installed'
        if (graphify.running) return 'A graphify build is already running'
        return graphifyCwd() ? null : NO_PROJECT
      },
      action: () => {
        const cwd = graphifyCwd()
        if (!cwd) return
        void useGraphifyStore.getState().run(cwd)
        // GraphifyPanel is where progress and errors are shown.
        usePanelRequestStore.getState().requestPanel('graphify')
      },
    },
  ]
}
