import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useScriptsStore } from '@/stores/scriptsStore'

const inputClass =
  'bg-panel border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-accent'

// Name and describe a script up front (same shape as New Todo Project); its
// commands are written in the tab that opens once it's created.
export function NewScriptModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    const title = name.trim()
    if (!title) return
    setSubmitting(true)
    setError(null)
    try {
      const script = await useScriptsStore.getState().create({ title, description: description.trim() })
      onClose()
      onCreated(script.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create script')
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-4">New Script</h2>
      <div className="flex flex-col gap-3">
        <label htmlFor="new-script-name" className="flex flex-col gap-1 text-xs text-fg-muted">
          Name
          <input
            id="new-script-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
            className={inputClass}
          />
        </label>
        <label htmlFor="new-script-description" className="flex flex-col gap-1 text-xs text-fg-muted">
          Description
          <textarea
            id="new-script-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What it does and when to use it (Claude reads this too)"
            className={`${inputClass} resize-y placeholder:text-fg-subtle`}
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
            onClick={() => void handleCreate()}
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
