import { useEffect } from 'react'
import { useMcpCatalogStore } from '@/stores/mcpCatalogStore'
import { MCP_SERVERS, useMcpServerStates } from '@/lib/mcpServers'
import { Switch } from '@/components/ui/Toggle'

// One vIDE MCP server: what it's for, who gets it, its on/off switch and the
// tools it exposes (read-only).
export function McpServerPage({ serverId }: { serverId: string }) {
  const server = MCP_SERVERS.find((s) => s.id === serverId)
  const states = useMcpServerStates()
  const tools = useMcpCatalogStore((s) => s.tools)
  const loadCatalog = useMcpCatalogStore((s) => s.load)

  useEffect(() => {
    loadCatalog().catch(() => {})
  }, [loadCatalog])

  if (!server) {
    return <div className="h-full flex items-center justify-center text-sm text-fg-muted">Unknown MCP server.</div>
  }

  const state = states[server.id]
  const list = tools?.[server.id] ?? []

  return (
    <div className="h-full overflow-y-auto bg-panel">
      <div className="max-w-4xl px-7 py-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-fg">{server.name}</h1>
              <span
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                  state.enabled ? 'bg-green-400/10 text-green-400' : 'bg-white/5 text-fg-muted'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${state.enabled ? 'bg-green-400' : 'border border-fg-muted'}`} />
                {state.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <span className="px-2 py-0.5 rounded-full border border-border text-xs text-fg-muted">built in</span>
            </div>
            <p className="mt-1.5 text-sm text-fg-muted">{server.description}</p>
          </div>
          {state.setEnabled ? (
            <Switch
              label={`Enable ${server.name}`}
              checked={state.enabled}
              disabled={state.pending}
              onChange={(value) => state.setEnabled?.(value)}
            />
          ) : (
            <span className="text-xs text-fg-muted">Always on</span>
          )}
        </div>
        {state.error && <p className="mt-2 text-xs text-red-400">{state.error}</p>}

        <dl className="mt-4 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-fg-muted">Registered as</dt>
          <dd className="text-fg">{server.name} · Claude Code user scope</dd>
          <dt className="text-fg-muted">Agents</dt>
          <dd className="text-fg">{server.agents}</dd>
        </dl>

        <h2 className="mt-6 pb-1.5 border-b border-border text-sm text-fg">
          Tools <span className="text-fg-muted">{list.length}</span>
        </h2>
        <table className="w-full text-xs">
          <tbody>
            {list.map((tool) => (
              <tr key={tool.name} className="border-b border-border/60 align-top">
                <td className="py-2 pr-4 w-56 font-mono text-fg">{tool.name}</td>
                <td className="py-2 text-fg-muted">{tool.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
