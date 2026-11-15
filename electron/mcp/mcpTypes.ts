// Shared with the renderer (tsconfig.web.json lists this file), so no imports.

export type McpServerId = 'todos' | 'browser' | 'notes' | 'scripts' | 'docs'

export interface McpToolInfo {
  name: string
  description: string
}
