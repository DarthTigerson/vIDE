import type { McpServerId } from '../../electron/mcp/mcpTypes'
import { useTodoMcpStore } from '@/stores/todoMcpStore'
import { useBrowserMcpStore } from '@/stores/browserMcpStore'
import { useNotesMcpStore } from '@/stores/notesMcpStore'
import { useScriptsMcpStore } from '@/stores/scriptsMcpStore'
import { useSearchMcpStore } from '@/stores/searchMcpStore'

export type { McpServerId }

export interface McpServerMeta {
  id: McpServerId
  // The name Claude Code registers it under (`claude mcp list`).
  name: string
  description: string
  // Who gets these tools: Claude through MCP, Bridge/llama built in.
  agents: string
}

// vIDE's own MCP servers, in panel order. Servers registered in Claude Code
// by anything else (claude.ai connectors, plugins) are Claude Code's to
// manage and stay out of this list.
export const MCP_SERVERS: McpServerMeta[] = [
  {
    id: 'todos',
    name: 'vide-todos',
    description: 'Todo boards for every agent: list, start, comment on and close tickets.',
    agents: 'Claude Code, Bridge and Llama sessions, while enabled.',
  },
  {
    id: 'browser',
    name: 'vide-browser',
    description: 'Drives a browser tab inside vIDE: navigate, click, type, read pages and take screenshots.',
    agents: 'Claude Code, Bridge and Llama sessions, while enabled.',
  },
  {
    id: 'notes',
    name: 'vide-notes',
    description: 'Read, search and write your vIDE notes.',
    agents: 'Claude Code, Bridge and Llama sessions, while enabled.',
  },
  {
    id: 'scripts',
    name: 'vide-scripts',
    description: 'Your saved shell routines: list, read, create, update and run them.',
    agents: 'Claude Code, Bridge and Llama sessions, while enabled.',
  },
  {
    id: 'docs',
    name: 'vide-docs',
    description: 'Reads large Markdown docs one section at a time instead of whole files.',
    agents: 'Always on for Claude Code, Bridge and Llama sessions.',
  },
  {
    id: 'search',
    name: 'vide-search',
    description: 'Web search without leaving vIDE.',
    agents: 'Claude Code while enabled. Bridge and Llama sessions always have it.',
  },
]

export interface McpServerState {
  enabled: boolean
  pending: boolean
  error: string | null
  // Missing for a server with no off switch (vide-docs).
  setEnabled?: (value: boolean) => Promise<void>
}

// Each server's on/off state, from the same stores its Settings page uses.
export function useMcpServerStates(): Record<McpServerId, McpServerState> {
  const todos = useTodoMcpStore()
  const browser = useBrowserMcpStore()
  const notes = useNotesMcpStore()
  const scripts = useScriptsMcpStore()
  const search = useSearchMcpStore()
  const pick = (s: McpServerState): McpServerState => ({ enabled: s.enabled, pending: s.pending, error: s.error, setEnabled: s.setEnabled })
  return {
    todos: pick(todos),
    browser: pick(browser),
    notes: pick(notes),
    scripts: pick(scripts),
    docs: { enabled: true, pending: false, error: null },
    search: pick(search),
  }
}
