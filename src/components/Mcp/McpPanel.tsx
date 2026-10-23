import { useEffect } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { useMcpCatalogStore } from '@/stores/mcpCatalogStore'
import { MCP_SERVERS, useMcpServerStates, type McpServerMeta } from '@/lib/mcpServers'
import { buildMcpServerPath } from '@/components/Settings/paths'
import { pillButtonClass } from '@/components/ui/pillButton'

function openServer(id: string) {
  useEditorStore.getState().openTab({ path: buildMcpServerPath(id), content: '', dirty: false })
}

// vIDE's own MCP servers: the enabled ones first, the rest under Disabled.
// A row opens the server's page, where it can be turned on or off.
export function McpPanel() {
  const states = useMcpServerStates()
  const tools = useMcpCatalogStore((s) => s.tools)
  const loadCatalog = useMcpCatalogStore((s) => s.load)
  const activeTabPath = useEditorStore((s) => s.activeTabPath)

  useEffect(() => {
    loadCatalog().catch(() => {})
  }, [loadCatalog])

  const enabled = MCP_SERVERS.filter((s) => states[s.id].enabled)
  const disabled = MCP_SERVERS.filter((s) => !states[s.id].enabled)

  function renderRow(server: McpServerMeta, on: boolean) {
    const active = activeTabPath === buildMcpServerPath(server.id)
    const count = tools?.[server.id].length
    return (
      <button
        key={server.id}
        type="button"
        onClick={() => openServer(server.id)}
        className={`w-full h-8 pl-3 pr-3 flex items-center gap-2.5 text-left text-sm hover:text-fg hover:bg-white/5 transition-colors ${
          active ? 'text-fg bg-white/5' : on ? 'text-fg-muted' : 'text-fg-subtle'
        }`}
      >
        <span
          aria-hidden="true"
          className={`shrink-0 w-[7px] h-[7px] rounded-full ${on ? 'bg-green-400' : 'border border-fg-muted'}`}
        />
        <span className="flex-1 truncate">{server.name}</span>
        {count !== undefined && (
          <span className="shrink-0 text-xs text-fg-subtle">{count} {count === 1 ? 'tool' : 'tools'}</span>
        )}
      </button>
    )
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 pl-3 pr-1.5 border-b border-border shrink-0 flex items-center">
        <span className="flex-1 text-xs font-semibold text-fg-muted uppercase tracking-wider">MCP Servers</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
        <section aria-label="Enabled">
          {enabled.map((server) => renderRow(server, true))}
        </section>
        {disabled.length > 0 && (
          <section aria-label="Disabled" className="mt-1.5">
            <div className="mx-3 h-px bg-border" />
            <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-muted">
              Disabled
              <span className="px-1.5 rounded-full bg-border text-fg-muted font-medium tracking-normal">{disabled.length}</span>
            </div>
            {disabled.map((server) => renderRow(server, false))}
          </section>
        )}
      </div>
      <div className="shrink-0 px-3 py-2 flex flex-col gap-1.5 border-t border-border">
        {/* Placeholder until the plugin store exists (VIDE-130/131). */}
        <button type="button" className={pillButtonClass}>
          Store
        </button>
      </div>
    </div>
  )
}
