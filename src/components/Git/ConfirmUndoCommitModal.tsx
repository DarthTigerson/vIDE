import { Modal } from '@/components/ui/Modal'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'

interface Props {
  cwd: string
  onClose: () => void
}

export function ConfirmUndoCommitModal({ cwd, onClose }: Props) {
  const { branch, aheadBehind } = useRepoGitState(cwd)
  const undoLastCommit = useGitStore((s) => s.undoLastCommit)
  // ahead === 0 means the tip commit is already on the remote — undoing it
  // locally leaves history diverged from origin until the next push forces
  // it back into sync, which is worth flagging up front.
  const alreadyPushed = aheadBehind !== null && aheadBehind.ahead === 0

  async function handleConfirm() {
    await undoLastCommit(cwd)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-1">Undo Last Commit</h2>
      <p className="text-sm text-fg-muted mb-2">
        Undo the last commit on <span className="font-mono text-fg">{branch ?? '…'}</span>, keeping
        its changes staged so you can pull and re-commit them.
      </p>
      {alreadyPushed && (
        <p className="text-sm text-amber-400 mb-2">
          This commit has already been pushed to origin — undoing it locally will need a force push
          to sync.
        </p>
      )}
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
          onClick={handleConfirm}
          className="px-4 py-1.5 text-sm rounded-lg bg-accent/80 hover:bg-accent text-on-accent font-semibold transition-colors"
        >
          Undo Commit
        </button>
      </div>
    </Modal>
  )
}
