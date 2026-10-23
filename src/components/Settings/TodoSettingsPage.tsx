import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'
import { AiRulesSection } from './AiRulesSection'
import { FeatureBlock } from './FeatureBlock'

export function TodoSettingsPage() {
  const enabled = useTodoSettingsStore((s) => s.enabled)
  const setEnabled = useTodoSettingsStore((s) => s.setEnabled)

  const mcpEnabled = useTodoMcpStore((s) => s.enabled)
  const mcpPending = useTodoMcpStore((s) => s.pending)
  const mcpError = useTodoMcpStore((s) => s.error)
  const setMcpEnabled = useTodoMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">To Do</h1>
        <p className="mb-4 text-sm text-fg-muted">Internal task tracking with named projects, a Kanban board, and attachments.</p>

        <FeatureBlock
          title="To Do"
          description="Adds a To Do icon to the activity bar with your task boards."
          toggle={{ checked: enabled, onChange: setEnabled, label: 'Enable To Do' }}
        />

        <FeatureBlock
          title="Claude Code"
          description="Lets Claude Code list, search, create and update your todos by ticket id, through an MCP server (claude mcp, user scope). Also installs a plugin that stops Claude from ending a turn without a progress comment on the ticket it started working on."
          toggle={{ checked: mcpEnabled, onChange: (value) => void setMcpEnabled(value), label: "Let Claude see & manage your todos", disabled: mcpPending }}
        >
          {mcpError && <p className="text-xs text-red-500">{mcpError}</p>}
          {mcpEnabled && <AiRulesSection tool="todos" />}
        </FeatureBlock>
      </div>
    </div>
  )
}
