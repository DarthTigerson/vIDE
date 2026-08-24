import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTodoStore } from '@/stores/todoStore'

const inputClass =
  'bg-panel border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-accent'

export function NewTodoProjectModal({ onClose }: { onClose: () => void }) {
  const createProject = useTodoStore((s) => s.createProject)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    if (!keyEdited) setKey(value.trim().charAt(0).toUpperCase())
  }

  async function handleCreate() {
    const trimmedName = name.trim()
    const trimmedKey = key.trim()
    if (!trimmedName || !trimmedKey) return
    setSubmitting(true)
    setError(null)
    try {
      await createProject(trimmedName, trimmedKey)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project')
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-4">New Todo Project</h2>
      <div className="flex flex-col gap-3">
        <label htmlFor="todo-project-name" className="flex flex-col gap-1 text-xs text-fg-muted">
          Name
          <input
            id="todo-project-name"
            autoFocus
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <label htmlFor="todo-project-key" className="flex flex-col gap-1 text-xs text-fg-muted">
          Key
          <input
            id="todo-project-key"
            value={key}
            onChange={(e) => {
              setKey(e.target.value.toUpperCase())
              setKeyEdited(true)
            }}
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
            onClick={handleCreate}
            disabled={!name.trim() || !key.trim() || submitting}
            className="px-3 py-1.5 rounded text-sm bg-accent text-on-accent hover:bg-accent/90 disabled:opacity-40 disabled:pointer-events-none"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
