import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTodoStore } from '@/stores/todoStore'
import type { TodoProject } from '@/types/api'

export function DeleteTodoProjectModal({
  project,
  onClose,
}: {
  project: TodoProject
  onClose: () => void
}) {
  const deleteProject = useTodoStore((s) => s.deleteProject)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const confirmed = confirmText === project.name

  async function handleDelete() {
    if (!confirmed) return
    setSubmitting(true)
    setError(null)
    try {
      await deleteProject(project.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete project')
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-2">Move to Trash</h2>
      <p className="text-xs text-fg-muted mb-4">
        This permanently deletes <span className="font-semibold text-fg">{project.name}</span> and every
        todo in it. This can&apos;t be undone.
      </p>
      <div className="flex flex-col gap-3">
        <label
          htmlFor="delete-todo-project-confirm"
          className="flex flex-col gap-1 text-xs text-fg-muted"
        >
          Type <span className="font-semibold text-fg">{project.name}</span> to confirm
          <input
            id="delete-todo-project-confirm"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="bg-panel border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-accent"
          />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || submitting}
            className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Move to Trash
          </button>
        </div>
      </div>
    </Modal>
  )
}
