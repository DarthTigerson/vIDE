import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { Toggle } from '@/components/ui/Toggle'

export function NotesSettingsPage() {
  const enabled = useNotesSettingsStore((s) => s.enabled)
  const setEnabled = useNotesSettingsStore((s) => s.setEnabled)

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
      </div>
    </div>
  )
}
