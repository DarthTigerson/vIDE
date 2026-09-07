import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function TodoSettingsPage() {
  const enabled = useTodoSettingsStore((s) => s.enabled)
  const setEnabled = useTodoSettingsStore((s) => s.setEnabled)
  const openInBiggestPane = useTodoSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useTodoSettingsStore((s) => s.setOpenInBiggestPane)

  const mcpEnabled = useTodoMcpStore((s) => s.enabled)
  const mcpPending = useTodoMcpStore((s) => s.pending)
  const mcpError = useTodoMcpStore((s) => s.error)
  const setMcpEnabled = useTodoMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">To Do</h1>
      <p className="text-sm text-fg-muted mb-4">
        Internal task tracking with named projects, a Kanban board, and attachments.
      </p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Enable To Do"
            description="Adds a To Do icon to the activity bar with your task boards."
            checked={enabled}
            onChange={setEnabled}
          />
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Always open in biggest pane"
            description="If the editor is split into multiple panes, open the task board in whichever pane currently has the most space, instead of the focused one."
            checked={openInBiggestPane}
            onChange={setOpenInBiggestPane}
          />
        </Row>
      </Section>

      <Section label="Claude Code">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Let Claude see & manage your todos"
            description="Registers an MCP server (claude mcp, user scope) so Claude Code can list, search, create, and update your todos by ticket id — no more pasting ticket details in. Also installs a plugin that stops Claude from ending a turn without a progress comment on whichever ticket it started working on."
            checked={mcpEnabled}
            onChange={(value) => void setMcpEnabled(value)}
            disabled={mcpPending}
          />
          {mcpError && <p className="text-xs text-red-500 mt-2">{mcpError}</p>}
        </Row>
      </Section>
    </div>
  )
}
