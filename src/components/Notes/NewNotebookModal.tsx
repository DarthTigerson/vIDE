import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useNotesStore } from '@/stores/notesStore'

const inputClass =
  'bg-panel border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-accent'

export function NewNotebookModal({ onClose }: { onClose: () => void }) {
  const createProject = useNotesStore((s) => s.createProject)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setSubmitting(true)
    setError(null)
    try {
      await createProject(trimmedName)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create notebook')
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-4">New Notebook</h2>
      <div className="flex flex-col gap-3">
        <label htmlFor="notebook-name" className="flex flex-col gap-1 text-xs text-fg-muted">
          Name
          <input
            id="notebook-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            className={inputClass}
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
            disabled={!name.trim() || submitting}
            className="px-3 py-1.5 rounded text-sm bg-accent text-on-accent hover:bg-accent/90 disabled:opacity-40 disabled:pointer-events-none"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
