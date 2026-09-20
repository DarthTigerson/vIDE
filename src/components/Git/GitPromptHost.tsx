import { useGitPromptStore } from '@/stores/gitPromptStore'
import { ConfirmForcePushModal } from './ConfirmForcePushModal'
import { ConfirmUndoCommitModal } from './ConfirmUndoCommitModal'
import { ConfirmHardResetModal } from './ConfirmHardResetModal'
import { GitResetPalette } from './GitResetPalette'
import { ConfirmActionModal } from './ConfirmActionModal'

// Mounted once in App. Renders whichever prompt the action palette asked for,
// using the same modals the Git panel uses.
export function GitPromptHost() {
  const prompt = useGitPromptStore((s) => s.prompt)
  const open = useGitPromptStore((s) => s.open)
  const close = useGitPromptStore((s) => s.close)

  if (!prompt) return null

  switch (prompt.kind) {
    case 'forcePush':
      return <ConfirmForcePushModal action={prompt.action} cwd={prompt.cwd} onClose={close} />
    case 'undoCommit':
      return <ConfirmUndoCommitModal cwd={prompt.cwd} onClose={close} />
    case 'hardResetPick':
      return (
        <GitResetPalette
          projectRoot={prompt.cwd}
          onClose={close}
          onPick={(ref) => open({ kind: 'hardResetConfirm', cwd: prompt.cwd, ref })}
        />
      )
    case 'hardResetConfirm':
      return <ConfirmHardResetModal cwd={prompt.cwd} targetRef={prompt.ref} onClose={close} />
    case 'confirm':
      return (
        <ConfirmActionModal
          title={prompt.title}
          message={prompt.message}
          confirmLabel={prompt.confirmLabel}
          onConfirm={prompt.onConfirm}
          onClose={close}
        />
      )
  }
}
