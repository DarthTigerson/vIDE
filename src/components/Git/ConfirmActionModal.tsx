import { Modal } from '@/components/ui/Modal'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

// Generic confirm for palette-triggered commands that have no existing modal
// (Discard All, Rebase Onto, Delete Branch). Same layout as the per-feature
// confirms in this folder.
export function ConfirmActionModal({ title, message, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-1">{title}</h2>
      <p className="text-sm text-fg-muted mb-5">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
