import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'
import { Toggle } from '@/components/ui/Toggle'

export function TodoSettingsPage() {
  const enabled = useTodoSettingsStore((s) => s.enabled)
  const setEnabled = useTodoSettingsStore((s) => s.setEnabled)

  const mcpEnabled = useTodoMcpStore((s) => s.enabled)
  const mcpPending = useTodoMcpStore((s) => s.pending)
  const mcpError = useTodoMcpStore((s) => s.error)
  const setMcpEnabled = useTodoMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">To Do</h1>
      <p className="text-sm text-fg-muted mb-8">
        Internal task tracking with named projects, a Kanban board, and attachments.
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Enable To Do"
            description="Adds a To Do icon to the activity bar with your task boards."
            checked={enabled}
            onChange={setEnabled}
          />
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Claude Code
          </h2>

          <Toggle
            label="Let Claude see & manage your todos"
            description="Registers an MCP server (claude mcp, user scope) so Claude Code can list, search, create, and update your todos by ticket id — no more pasting ticket details in. Also installs a plugin that stops Claude from ending a turn without a progress comment on whichever ticket it started working on."
            checked={mcpEnabled}
            onChange={(value) => void setMcpEnabled(value)}
            disabled={mcpPending}
          />
          {mcpError && <p className="text-xs text-red-500">{mcpError}</p>}
        </section>
      </div>
    </div>
  )
}
