import type { Command } from './commands'
import { openTab } from './commands'
import { useClaudeStore } from '@/stores/claudeStore'
import { isMac } from '@/lib/platform'
import { buildTerminalPath } from '@/components/Settings/paths'

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
  ]
}
