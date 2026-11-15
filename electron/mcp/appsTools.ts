import { request } from 'http'
import type { McpToolDef } from './protocol'
import type { AgentToolDecl } from '../apps/appManifest'

// Tools that store apps declare in their manifest, offered to every agent.
// Claude reaches them through the vide-apps MCP server, which forwards calls
// over the per-window socket; Bridge calls the AppHost in-process. Kept free
// of Electron imports so the standalone server and tests can load it.

export interface AppToolGroup {
  appId: string
  appName: string
  instructions?: string
  tools: AgentToolDecl[]
}

// The slice of AppHost this file needs.
export interface AppToolSource {
  agentToolList(): AppToolGroup[]
  callAgentTool(name: string, args: Record<string, unknown>, windowId?: number): Promise<string>
}

type RouteHost = { registerRoute(url: string, handler: (windowId: number, body: string) => Promise<unknown>): void }

// Socket routes: `/app-tools/list` -> { apps }, `/app-tools/call` with JSON
// `{ name, args }` -> { text }. A throw becomes the bridge's 4xx `{ error }`.
export function registerAppToolRoutes(bridge: RouteHost, source: AppToolSource): void {
  bridge.registerRoute('/app-tools/list', () => handleAppToolsList(source))
  bridge.registerRoute('/app-tools/call', (windowId, body) => handleAppToolsCall(source, windowId, body))
}

export async function handleAppToolsList(source: AppToolSource): Promise<{ apps: AppToolGroup[] }> {
  return { apps: source.agentToolList() }
}

export async function handleAppToolsCall(source: AppToolSource, windowId: number, body: string): Promise<{ text: string }> {
  let parsed: { name?: unknown; args?: unknown }
  try { parsed = JSON.parse(body) } catch { throw new Error('Body must be JSON') }
  if (typeof parsed.name !== 'string' || parsed.name === '') throw new Error('Missing tool name')
  const args = parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args) ? (parsed.args as Record<string, unknown>) : {}
  return { text: await source.callAgentTool(parsed.name, args, windowId) }
}

// Proxy tool defs for a list of apps. `call` runs one tool (socket or in-process).
export function appToolsFromList(apps: AppToolGroup[], call: (name: string, args: Record<string, unknown>) => Promise<string>): McpToolDef[] {
  return apps.flatMap((a) =>
    a.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      handler: (args: Record<string, unknown>) => call(t.name, args),
    })),
  )
}

export function appInstructions(apps: AppToolGroup[]): string[] {
  return apps.filter((a) => a.instructions).map((a) => a.instructions!)
}

function socketPost(socketPath: string, windowId: string, path: string, body: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, method: 'POST', headers: { 'X-Vide-Window-Id': windowId, 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let parsed: any = {}
          try { parsed = JSON.parse(text) } catch { /* not JSON */ }
          if ((res.statusCode ?? 0) >= 400) reject(new Error(parsed.error ?? text))
          else resolve(parsed)
        })
      },
    )
    req.on('error', (err) => reject(new Error(`Could not reach vIDE (${err.message}). Is vIDE running, with this window still open?`)))
    req.end(body)
  })
}

export async function fetchAppToolList(socketPath: string, windowId: string): Promise<AppToolGroup[]> {
  const res = (await socketPost(socketPath, windowId, '/app-tools/list', '')) as { apps?: AppToolGroup[] }
  return Array.isArray(res.apps) ? res.apps : []
}

export function socketAppToolCaller(socketPath: string, windowId: string): (name: string, args: Record<string, unknown>) => Promise<string> {
  return async (name, args) => {
    const res = (await socketPost(socketPath, windowId, '/app-tools/call', JSON.stringify({ name, args }))) as { text?: string }
    return res.text ?? ''
  }
}

// Bridge's in-process tools: same defs, calls go straight to the AppHost.
export function appToolSet(source: AppToolSource, windowId: number): { tools: McpToolDef[]; instructions: string[] } {
  const apps = source.agentToolList()
  return {
    tools: appToolsFromList(apps, (name, args) => source.callAgentTool(name, args, windowId)),
    instructions: appInstructions(apps),
  }
}
