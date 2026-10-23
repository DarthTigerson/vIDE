import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { useNotesMcpStore } from '@/stores/notesMcpStore'
import { AiRulesSection } from './AiRulesSection'
import { FeatureBlock } from './FeatureBlock'

export function NotesSettingsPage() {
  const enabled = useNotesSettingsStore((s) => s.enabled)
  const setEnabled = useNotesSettingsStore((s) => s.setEnabled)

  const mcpEnabled = useNotesMcpStore((s) => s.enabled)
  const mcpPending = useNotesMcpStore((s) => s.pending)
  const mcpError = useNotesMcpStore((s) => s.error)
  const setMcpEnabled = useNotesMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Notes</h1>
        <p className="mb-4 text-sm text-fg-muted">Notebooks of markdown notes and folders, stored outside any git repo and edited in the real editor.</p>

        <FeatureBlock
          title="Notes"
          description="Adds a Notes icon to the activity bar with your notebooks."
          toggle={{ checked: enabled, onChange: setEnabled, label: 'Enable Notes' }}
        />

        <FeatureBlock
          title="Claude Code"
          description="Lets Claude Code list, search, read and write your markdown notes from any session, through an MCP server (claude mcp, user scope). Turning it off removes the MCP tools; the note files on disk stay readable by any process with filesystem access."
          toggle={{ checked: mcpEnabled, onChange: (value) => void setMcpEnabled(value), label: "Let Claude read & write your notes", disabled: mcpPending }}
        >
          {mcpError && <p className="text-xs text-red-500">{mcpError}</p>}
          {mcpEnabled && <AiRulesSection tool="notes" />}
        </FeatureBlock>
      </div>
    </div>
  )
}
