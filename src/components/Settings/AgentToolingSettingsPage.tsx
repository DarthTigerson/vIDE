import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/Toggle'
import { accentSolidColor } from '@/components/ui/pillButton'
import { useMcpCatalogStore } from '@/stores/mcpCatalogStore'
import { useStoreStore, findStoreApp } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useAppContribStore } from '@/apps/appContribStore'
import { MCP_SERVERS, useMcpServerStates } from '@/lib/mcpServers'
import { AppMonogram } from '@/components/Store/storeUi'
import { AgentToolList } from '@/components/Store/AgentToolList'
import { buildStoreAppPath } from './paths'

const SOURCE_LABEL = { store: 'Store app', file: 'From file', dev: 'Dev app' } as const

const countLabel = (n: number) => `${n} ${n === 1 ? 'tool' : 'tools'}`

// Settings > Integrations > Agent Tooling: every tool an agent can call,
// vIDE's own and the ones Store apps add. Built-in switches are the ones on
// the Notes, Scripts, To Do and Browser pages; an app's switch is the app's
// enable/disable.
export function AgentToolingSettingsPage() {
  const states = useMcpServerStates()
  const catalog = useMcpCatalogStore((s) => s.tools)
  const loadCatalog = useMcpCatalogStore((s) => s.load)
  const apps = useAppContribStore((s) => s.apps)
  const registry = useStoreStore((s) => s.registry)
  const busy = useStoreStore((s) => s.busy)
  const setAppEnabled = useStoreStore((s) => s.setEnabled)
  const openWithCategory = useStoreStore((s) => s.openWithCategory)
  const openTab = useEditorStore((s) => s.openTab)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => { loadCatalog().catch(() => {}) }, [loadCatalog])

  const toggleOpen = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const toolApps = apps.filter((a) => (a.agentTools?.length ?? 0) > 0)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Agent Tooling</h1>
        <p className="mb-4 max-w-[80ch] text-sm text-fg-muted">
          Tools that Claude Code, Bridge and Llama sessions can call. vIDE hands every agent the full list of enabled tools when a session starts. Changes apply to new sessions.
        </p>

        <GroupTitle title="Built in" count={MCP_SERVERS.length} />
        <ul aria-label="Built in" className="overflow-hidden rounded-lg border border-border">
          {MCP_SERVERS.map((server) => {
            const state = states[server.id]
            const tools = catalog?.[server.id] ?? []
            const key = `built-in:${server.id}`
            return (
              <Row
                key={key}
                icon={<span aria-hidden="true" className="h-2 w-2 rounded-xs bg-fg-muted" />}
                title={<code className="font-mono text-[0.78rem]">{server.name}</code>}
                description={server.description}
                count={catalog ? countLabel(tools.length) : ''}
                expanded={open.has(key)}
                onToggle={() => toggleOpen(key)}
                control={state.setEnabled
                  ? <Switch label={`Enable ${server.name}`} checked={state.enabled} disabled={state.pending} onChange={(v) => void state.setEnabled!(v)} />
                  : <span className="whitespace-nowrap text-[0.6875rem] text-fg-subtle">Always on</span>}
              >
                {state.error && <p className="mb-1 text-xs text-red-500">{state.error}</p>}
                <AgentToolList tools={tools} label={`${server.name} tools`} />
              </Row>
            )
          })}
        </ul>

        <div className="mt-5">
          <GroupTitle title="From apps" count={toolApps.length} />
          {toolApps.length === 0 ? (
            <p className="rounded-lg border border-border px-3.5 py-3.5 text-xs text-fg-subtle">
              No installed Store app adds agent tools yet.
            </p>
          ) : (
            <ul aria-label="From apps" className="overflow-hidden rounded-lg border border-border">
              {toolApps.map((app) => {
                const key = `app:${app.id}`
                const tools = app.agentTools ?? []
                return (
                  <Row
                    key={key}
                    icon={<AppMonogram name={app.name} size="sm" icon={app.icon} />}
                    title={
                      <>
                        <span>{app.name}</span>
                        <span className="rounded-full border border-accent/45 px-1.5 text-[0.6875rem] text-accent">
                          {SOURCE_LABEL[app.source]} · v{app.version}
                        </span>
                      </>
                    }
                    // Installed apps carry no description of their own; the catalog's, else the tool names.
                    description={findStoreApp(registry, app.id)?.description ?? tools.map((t) => t.name).join(', ')}
                    count={countLabel(tools.length)}
                    expanded={open.has(key)}
                    onToggle={() => toggleOpen(key)}
                    extra={app.source !== 'dev' && (
                      <button
                        type="button"
                        className="whitespace-nowrap text-xs text-accent hover:underline"
                        onClick={() => openTab({ path: buildStoreAppPath(app.id), content: '', dirty: false })}
                      >
                        Store page
                      </button>
                    )}
                    control={
                      <Switch
                        label={`Enable ${app.name}`}
                        checked={app.status !== 'disabled'}
                        disabled={!!busy[app.id]}
                        onChange={(v) => void setAppEnabled(app.id, v)}
                      />
                    }
                  >
                    <AgentToolList tools={tools} label={`${app.name} tools`} />
                  </Row>
                )
              })}
            </ul>
          )}
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`h-8 rounded-full px-4 text-xs font-bold transition-colors ${accentSolidColor}`}
              onClick={() => openWithCategory('agent-tools')}
            >
              Get more tools in the Store
            </button>
            <span className="text-xs text-fg-subtle">Opens the Store filtered to Agent tools.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-muted">
      {title}
      <span className="rounded-full bg-border px-1.5 font-medium normal-case tracking-normal">{count}</span>
    </h2>
  )
}

// One list row: the left part opens/closes the tool list, the switch and the
// Store link sit outside that button so they never toggle it.
function Row({ icon, title, description, count, expanded, onToggle, control, extra, children }: {
  icon: React.ReactNode
  title: React.ReactNode
  description: string
  count: string
  expanded: boolean
  onToggle: () => void
  control: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className={`border-t border-border first:border-t-0 ${expanded ? 'bg-white/[0.025]' : ''}`}>
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-[0.84rem] text-fg">{title}</span>
            <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>
          </span>
          <span className="whitespace-nowrap text-xs text-fg-subtle">{count}</span>
        </button>
        {extra}
        {control}
      </div>
      {expanded && <div className="px-3.5 pb-3 pl-[3.25rem]">{children}</div>}
    </li>
  )
}
