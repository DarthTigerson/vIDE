import type { McpToolDef, McpToolImageResult } from './mcp/protocol'
import { buildTodoTools, TODO_WORKFLOW_INSTRUCTIONS } from './mcp/todoTools'
import { buildNotesTools } from './mcp/notesTools'
import { buildScriptsTools, socketRunner, SCRIPTS_INSTRUCTIONS } from './mcp/scriptsTools'
import { buildBrowserTools, BROWSER_INSTRUCTIONS } from './mcp/browserTools'
import { buildSearchTools, SEARCH_INSTRUCTIONS } from './mcp/searchTools'
import { buildDocsTools, DOCS_INSTRUCTIONS } from './mcp/docsTools'

// The vIDE tool groups Claude reaches over MCP (electron/mcp/*McpServer.ts).
// Bridge/llama sessions get the exact same McpToolDef objects, called
// in-process, so every agent has the same tools — a new vIDE tool is written
// once in electron/mcp/ and shows up everywhere.
export type VideToolGroup = 'todos' | 'notes' | 'scripts' | 'browser' | 'search' | 'docs'

export const ALL_VIDE_TOOL_GROUPS: VideToolGroup[] = ['todos', 'notes', 'scripts', 'browser', 'search', 'docs']

// Groups with no per-feature toggle: always on for every agent.
export const ALWAYS_ON_VIDE_TOOL_GROUPS: VideToolGroup[] = ['search', 'docs']

export interface VideToolContext {
  dataDir: string
  // The browser shim socket (BrowserBridge.socketPath). Browser and
  // script-running tools need it plus the window id; without it those groups
  // are skipped, like the MCP servers do outside a vIDE-launched session.
  socketPath?: string
}

// Who a Bridge session's todo tickets and comments are attributed to.
export type BridgeAgentKind = 'bridge' | 'llama'

export interface VideToolSet {
  tools: McpToolDef[]
  instructions: string[]
}

export function buildVideTools(groups: VideToolGroup[], ctx: VideToolContext, windowId: number, agent: BridgeAgentKind = 'bridge'): VideToolSet {
  const tools: McpToolDef[] = []
  const instructions: string[] = []
  const win = String(windowId)
  for (const group of groups) {
    switch (group) {
      case 'todos':
        tools.push(...buildTodoTools(ctx.dataDir, agent))
        instructions.push(TODO_WORKFLOW_INSTRUCTIONS)
        break
      case 'notes':
        tools.push(...buildNotesTools(ctx.dataDir))
        break
      case 'scripts':
        tools.push(...buildScriptsTools(ctx.dataDir, ctx.socketPath ? socketRunner(ctx.socketPath, win) : undefined))
        instructions.push(SCRIPTS_INSTRUCTIONS)
        break
      case 'browser':
        if (!ctx.socketPath) break
        tools.push(...buildBrowserTools(ctx.socketPath, win))
        instructions.push(BROWSER_INSTRUCTIONS)
        break
      case 'search':
        tools.push(...buildSearchTools())
        instructions.push(SEARCH_INSTRUCTIONS)
        break
      case 'docs':
        tools.push(...buildDocsTools())
        instructions.push(DOCS_INSTRUCTIONS)
        break
    }
  }
  return { tools, instructions }
}

export function toOpenAiTool(def: McpToolDef) {
  return { type: 'function' as const, function: { name: def.name, description: def.description, parameters: def.inputSchema } }
}

// Chat-completions tool messages are text-only, so an image result (e.g.
// browser_screenshot) keeps its text and says the image was left out.
export function toolResultText(result: string | McpToolImageResult): string {
  if (typeof result === 'string') return result
  const note = `[${result.image.mimeType} image omitted — this model receives tool results as text only]`
  return result.text ? `${result.text}\n${note}` : note
}
