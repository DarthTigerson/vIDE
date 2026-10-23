import type { Command } from './commands'
import { openTab } from './commands'
import { useClaudeStore } from '@/stores/claudeStore'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useLlamaModelsStore } from '@/stores/llamaModelsStore'
import { availableAgents, TERMINAL_KIND } from '@/lib/agentKinds'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { openNewBrowserTab } from '@/lib/openBrowserTab'
import { isMac } from '@/lib/platform'
import { buildTerminalPath } from '@/components/Settings/paths'

const NO_PROJECT = 'Open a project first'
// Picker ids of the Rocky mode rows: this prefix, then the agent's kind.
const ROCKY_PICK_PREFIX = 'rocky|'

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
      description: 'Open a terminal tab in the active pane, or the bottom terminal when it is on',
      keywords: ['shell', 'bash', 'zsh', 'console'],
      shortcut: isMac ? '⌘T' : 'Ctrl+T',
      action: () => {
        const id = Date.now().toString(36)
        openTab(buildTerminalPath(id))
      },
    },
    {
      id: 'bottom-terminal-on',
      label: 'Show Bottom Terminal',
      description: 'Lock every terminal into a panel under the editor',
      keywords: ['terminal', 'panel', 'bottom', 'toggle', 'shell', 'split'],
      condition: () => !useBottomTerminalStore.getState().enabled,
      action: () => useBottomTerminalStore.getState().setEnabled(true),
    },
    {
      id: 'bottom-terminal-off',
      label: 'Hide Bottom Terminal',
      description: 'Move its terminals back into the editor as tabs',
      keywords: ['terminal', 'panel', 'bottom', 'toggle', 'shell'],
      condition: () => useBottomTerminalStore.getState().enabled,
      action: () => useBottomTerminalStore.getState().setEnabled(false),
    },
    {
      id: 'inline-diff-show',
      label: 'Show Inline Diff Highlight',
      description: 'Tint changed lines and highlight changed words in the editor',
      keywords: ['git', 'changes', 'toggle', 'gutter', 'word'],
      condition: () => !useEditorSettingsStore.getState().inlineDiffEnabled,
      action: () => useEditorSettingsStore.getState().setInlineDiffEnabled(true),
    },
    {
      id: 'inline-diff-hide',
      label: 'Hide Inline Diff Highlight',
      description: 'Keep only the gutter markers for changed lines',
      keywords: ['git', 'changes', 'toggle', 'gutter', 'word'],
      condition: () => useEditorSettingsStore.getState().inlineDiffEnabled,
      action: () => useEditorSettingsStore.getState().setInlineDiffEnabled(false),
    },
    {
      id: 'new-agent-session',
      label: 'New Agent Session…',
      description: 'Start a Claude, Bridge, local model or terminal session',
      keywords: ['new', 'session', 'chat', 'assistant', 'agent', 'claude', 'bridge', 'llama', 'model', 'terminal', 'shell'],
      disabledReason: () => (projectRoot() ? null : NO_PROJECT),
      pick: () => ({
        placeholder: 'Start which agent?',
        emptyText: 'No agents enabled — turn one on in Settings',
        items: (() => {
          const agents = availableAgents(useModelSettingsStore.getState().enabled, useLlamaModelsStore.getState().models)
          return [
            ...agents.map((o) => ({ id: o.kind, label: o.label })),
            // The "+" menu's Rocky tab, one row per agent.
            ...agents.map((o) => ({ id: `${ROCKY_PICK_PREFIX}${o.kind}`, label: `${o.label} (Rocky mode)` })),
            // Same as the "+" menu: a plain shell is always on offer.
            { id: TERMINAL_KIND, label: 'Terminal' },
          ]
        })(),
        onPick: (id) => {
          const root = projectRoot()
          if (!root) return
          const rocky = id.startsWith(ROCKY_PICK_PREFIX)
          useClaudeStore.getState().newSession(root, rocky ? id.slice(ROCKY_PICK_PREFIX.length) : id, rocky)
          useClaudeStore.getState().setChatVisible(true)
        },
      }),
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
