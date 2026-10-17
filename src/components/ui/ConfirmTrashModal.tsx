import { Modal } from './Modal'

// "Move <name> to the Trash?" confirm shared by the file tree, the Git panel's
// untracked files and the Search panel's result menu. The Scripts panel reuses
// it for a permanent delete by overriding the wording.
export function ConfirmTrashModal({ name, onCancel, onConfirm, title = 'Move to Trash', verb = 'Move', suffix = 'to the Trash?', confirmLabel = 'Move to Trash' }: {
  name: string
  onCancel: () => void
  onConfirm: () => void
  title?: string
  verb?: string
  suffix?: string
  confirmLabel?: string
}) {
  return (
    <Modal onClose={onCancel}>
      <h2 className="text-sm font-semibold text-fg mb-1">{title}</h2>
      <p className="text-sm text-fg-muted mb-5">
        {verb}{' '}
        <span className="font-mono text-fg break-all">
          {name}
        </span>{' '}
        {suffix}
      </p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
