import { Modal } from '@/components/ui/Modal'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'

interface Props {
  cwd: string
  targetRef: string
  onClose: () => void
}

// Doubles as the confirm for the plain "Reset" button (targetRef === 'HEAD',
// which only discards uncommitted changes since there's nothing to rewind
// history-wise) and for "Hard Reset…" to an arbitrary picked ref.
export function ConfirmHardResetModal({ cwd, targetRef, onClose }: Props) {
  const branch = useRepoGitState(cwd).branch
  const hardReset = useGitStore((s) => s.hardReset)
  const isHead = targetRef === 'HEAD'
  const label = isHead ? 'Reset' : 'Hard Reset'

  async function handleConfirm() {
    await hardReset(cwd, targetRef)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-1">{label}</h2>
      <p className="text-sm text-fg-muted mb-5">
        {isHead ? (
          <>
            Discard all uncommitted changes on{' '}
            <span className="font-mono text-fg">{branch ?? '…'}</span> and restore it to its last
            commit? This cannot be undone.
          </>
        ) : (
          <>
            Reset <span className="font-mono text-fg">{branch ?? '…'}</span> to{' '}
            <span className="font-mono text-fg">{targetRef}</span>? This discards any commits and
            uncommitted changes after that point. This cannot be undone.
          </>
        )}
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
          {label}
        </button>
      </div>
    </Modal>
  )
}
