import { useState } from 'react'

type ResetStep =
  | { kind: 'confirmUndoPush' }
  | { kind: 'pickRef' }
  | { kind: 'confirmHard'; ref: string }

// Shared by GitActionsMenu (footer) and RepoSection (the Git panel's per-repo
// accordion section) — both trigger the same "Reset" split button:
//   - main click            → hard-reset to HEAD (discard uncommitted changes)
//   - "Hard Reset…"         → hard-reset to a picked branch/tag/hash
//   - "Undo Last Push"      → soft-reset one commit back, changes stay staged
// No safety-setting bypass here (unlike force push): everything always
// confirms before running.
export function useGitResetConfirm() {
  const [step, setStep] = useState<ResetStep | null>(null)

  return {
    step,
    requestResetToHead: () => setStep({ kind: 'confirmHard', ref: 'HEAD' }),
    requestUndoPush: () => setStep({ kind: 'confirmUndoPush' }),
    requestHardReset: () => setStep({ kind: 'pickRef' }),
    pickRef: (ref: string) => setStep({ kind: 'confirmHard', ref }),
    close: () => setStep(null),
  }
}
