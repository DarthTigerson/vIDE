import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTodoStore } from '@/stores/todoStore'
import type { TodoProject } from '@/types/api'

const inputClass =
  'bg-panel border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-accent'

export function RenameTodoProjectModal({
  project,
  onClose,
}: {
  project: TodoProject
  onClose: () => void
}) {
  const renameProject = useTodoStore((s) => s.renameProject)
  const [name, setName] = useState(project.name)
  const [key, setKey] = useState(project.key)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    const trimmedName = name.trim()
    const trimmedKey = key.trim()
    if (!trimmedName || !trimmedKey) return
    setSubmitting(true)
    setError(null)
    try {
      await renameProject(project.id, trimmedName, trimmedKey)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename project')
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-4">Rename Project</h2>
      <div className="flex flex-col gap-3">
        <label htmlFor="rename-todo-project-name" className="flex flex-col gap-1 text-xs text-fg-muted">
          Name
          <input
            id="rename-todo-project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label htmlFor="rename-todo-project-key" className="flex flex-col gap-1 text-xs text-fg-muted">
          Key
          <input
            id="rename-todo-project-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            className={`${inputClass} font-mono uppercase`}
          />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-fg-muted hover:text-fg hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || !key.trim() || submitting}
            className="px-3 py-1.5 rounded text-sm bg-accent text-on-accent hover:bg-accent/90 disabled:opacity-40 disabled:pointer-events-none"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
