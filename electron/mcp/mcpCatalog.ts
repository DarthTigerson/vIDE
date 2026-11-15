import { ipcMain } from 'electron'
import { buildTodoTools } from './todoTools'
import { buildNotesTools } from './notesTools'
import { buildBrowserTools } from './browserTools'
import { buildScriptsTools } from './scriptsTools'
import { buildDocsTools } from './docsTools'
import type { McpServerId, McpToolInfo } from './mcpTypes'

// The tools each vIDE MCP server exposes, for the MCP panel. Built from the
// same definitions the servers use, with placeholder paths: building a tool
// list only creates closures, it doesn't touch the disk or a socket.
export function mcpToolCatalog(): Record<McpServerId, McpToolInfo[]> {
  const info = (tools: { name: string; description: string }[]): McpToolInfo[] =>
    tools.map(({ name, description }) => ({ name, description }))
  return {
    todos: info(buildTodoTools('')),
    browser: info(buildBrowserTools('', '')),
    notes: info(buildNotesTools('')),
    scripts: info(buildScriptsTools('')),
    docs: info(buildDocsTools()),
  }
}

export function registerMcpCatalogHandlers(): void {
  ipcMain.handle('mcp:catalog', () => mcpToolCatalog())
}

// Every built-in vIDE tool name; an app tool may not reuse one.
export function builtInToolNames(): string[] {
  return Object.values(mcpToolCatalog()).flatMap((tools) => tools.map((t) => t.name))
}
