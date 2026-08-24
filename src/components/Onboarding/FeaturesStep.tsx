import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { Toggle } from '@/components/ui/Toggle'

export function FeaturesStep() {
  const todoEnabled = useTodoSettingsStore((s) => s.enabled)
  const setTodoEnabled = useTodoSettingsStore((s) => s.setEnabled)
  const notesEnabled = useNotesSettingsStore((s) => s.enabled)
  const setNotesEnabled = useNotesSettingsStore((s) => s.setEnabled)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Which extras do you want?</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          Controls which icons show up in the activity bar. Change either of these anytime in
          Settings → To Do / Notes.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Toggle
          label="To Do"
          description="Internal task tracking with named projects, a Kanban board, and attachments."
          checked={todoEnabled}
          onChange={setTodoEnabled}
        />
        <Toggle
          label="Notes"
          description="Notebooks of markdown notes and folders, stored outside any git repo."
          checked={notesEnabled}
          onChange={setNotesEnabled}
        />
      </div>
    </div>
  )
}
