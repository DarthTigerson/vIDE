import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { useNotesMcpStore } from '@/stores/notesMcpStore'
import { Toggle } from '@/components/ui/Toggle'

export function NotesSettingsPage() {
  const enabled = useNotesSettingsStore((s) => s.enabled)
  const setEnabled = useNotesSettingsStore((s) => s.setEnabled)

  const mcpEnabled = useNotesMcpStore((s) => s.enabled)
  const mcpPending = useNotesMcpStore((s) => s.pending)
  const mcpError = useNotesMcpStore((s) => s.error)
  const setMcpEnabled = useNotesMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Notes</h1>
      <p className="text-sm text-fg-muted mb-8">
        Notebooks of markdown notes and folders, stored outside any git repo and edited
        in the real editor.
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Enable Notes"
            description="Adds a Notes icon to the activity bar with your notebooks."
            checked={enabled}
            onChange={setEnabled}
          />
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Claude Code
          </h2>

          <Toggle
            label="Let Claude read & write your notes"
            description="Registers an MCP server (claude mcp, user scope) so Claude Code can list, search, read, and write your markdown notes from any session. Disabling removes the MCP tools — note files on disk remain accessible to any process with filesystem access."
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
