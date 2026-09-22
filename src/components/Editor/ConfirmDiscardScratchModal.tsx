import { Modal } from '@/components/ui/Modal'

interface Props {
  // How many never-saved buffers this close would destroy. 1 for a single tab.
  count: number
  onConfirm: () => void
  onClose: () => void
}

// Closing an unsaved scratch tab is the one close in the app that destroys
// data outright — a dirty tab backed by a real file still has its on-disk
// copy to fall back on, this has nothing anywhere. Hence a confirm, and a
// red button rather than the accent one every other modal confirms with.
export function ConfirmDiscardScratchModal({ count, onConfirm, onClose }: Props) {
  const one = count === 1
  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-1">
        {one ? 'Discard unsaved file?' : `Discard ${count} unsaved files?`}
      </h2>
      <p className="text-sm text-fg-muted mb-2">
        {one ? 'This file has never been saved.' : `${count} of these files have never been saved.`}
        {' '}Their contents will be lost and cannot be recovered.
      </p>
      <div className="flex items-center justify-end gap-3 mt-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
        >
          Delete permanently
        </button>
      </div>
    </Modal>
  )
}
