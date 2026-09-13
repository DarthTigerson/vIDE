import { useState } from 'react'

type ResetStep =
  | { kind: 'confirmUndo' }
  | { kind: 'pickRef' }
  | { kind: 'confirmHard'; ref: string }

// Shared by GitActionsMenu (footer) and RepoSection (the Git panel's per-repo
// accordion section) — both trigger the same "Git Reset" split button.
// Unlike force push, there's no safety-setting bypass here: Undo Last Commit
// and Hard Reset always confirm before running.
export function useGitResetConfirm() {
  const [step, setStep] = useState<ResetStep | null>(null)

  return {
    step,
    requestUndo: () => setStep({ kind: 'confirmUndo' }),
    requestHardReset: () => setStep({ kind: 'pickRef' }),
    pickRef: (ref: string) => setStep({ kind: 'confirmHard', ref }),
    close: () => setStep(null),
  }
}
