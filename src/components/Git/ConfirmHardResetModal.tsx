import { Modal } from '@/components/ui/Modal'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'

interface Props {
  cwd: string
  targetRef: string
  onClose: () => void
}

export function ConfirmHardResetModal({ cwd, targetRef, onClose }: Props) {
  const branch = useRepoGitState(cwd).branch
  const hardReset = useGitStore((s) => s.hardReset)

  async function handleConfirm() {
    await hardReset(cwd, targetRef)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-1">Hard Reset</h2>
      <p className="text-sm text-fg-muted mb-5">
        Reset <span className="font-mono text-fg">{branch ?? '…'}</span> to{' '}
        <span className="font-mono text-fg">{targetRef}</span>? This discards any commits and
        uncommitted changes after that point. This cannot be undone.
      </p>
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
          onClick={handleConfirm}
          className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
        >
          Hard Reset
        </button>
      </div>
    </Modal>
  )
}
