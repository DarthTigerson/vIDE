import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { useNotesMcpStore } from '@/stores/notesMcpStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function NotesSettingsPage() {
  const enabled = useNotesSettingsStore((s) => s.enabled)
  const setEnabled = useNotesSettingsStore((s) => s.setEnabled)
  const openInBiggestPane = useNotesSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useNotesSettingsStore((s) => s.setOpenInBiggestPane)

  const mcpEnabled = useNotesMcpStore((s) => s.enabled)
  const mcpPending = useNotesMcpStore((s) => s.pending)
  const mcpError = useNotesMcpStore((s) => s.error)
  const setMcpEnabled = useNotesMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Notes</h1>
      <p className="text-sm text-fg-muted mb-4">
        Notebooks of markdown notes and folders, stored outside any git repo and edited
        in the real editor.
      </p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Enable Notes"
            description="Adds a Notes icon to the activity bar with your notebooks."
            checked={enabled}
            onChange={setEnabled}
          />
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Always open in biggest pane"
            description="If the editor is split into multiple panes, open notes in whichever pane currently has the most space, instead of the focused one."
            checked={openInBiggestPane}
            onChange={setOpenInBiggestPane}
          />
        </Row>
      </Section>

      <Section label="Claude Code">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Let Claude read & write your notes"
            description="Registers an MCP server (claude mcp, user scope) so Claude Code can list, search, read, and write your markdown notes from any session. Disabling removes the MCP tools — note files on disk remain accessible to any process with filesystem access."
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
