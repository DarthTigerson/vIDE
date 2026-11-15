import { Modal } from '@/components/ui/Modal'
import { accentSolidColor } from '@/components/ui/pillButton'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  // 'danger' (default) for destructive actions; 'accent' for a normal go-ahead like Install.
  tone?: 'danger' | 'accent'
}

// Generic confirm for palette-triggered commands that have no existing modal
// (Discard All, Rebase Onto, Delete Branch). Same layout as the per-feature
// confirms in this folder.
export function ConfirmActionModal({ title, message, confirmLabel, onConfirm, onClose, tone = 'danger' }: Props) {
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
          className={`px-4 py-1.5 text-sm rounded-lg font-semibold transition-colors ${tone === 'accent' ? accentSolidColor : 'bg-red-600/80 hover:bg-red-600 text-white'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
