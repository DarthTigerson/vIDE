import { create } from 'zustand'
import { useGitStore } from './gitStore'
import { useGitSettingsStore } from './gitSettingsStore'

export type ForceAction = 'forcePush' | 'forcePushLease'

// One pending prompt at a time. The existing confirms are driven by
// component-local hooks (useForcePushConfirm, useGitResetConfirm) inside
// RepoSection/GitActionsMenu, which the action palette cannot reach, so the
// palette asks for the same modals through here and GitPromptHost renders them.
export type GitPrompt =
  | { kind: 'forcePush'; action: ForceAction; cwd: string }
  | { kind: 'undoCommit'; cwd: string }
  | { kind: 'hardResetPick'; cwd: string }
  | { kind: 'hardResetConfirm'; cwd: string; ref: string }
  | { kind: 'confirm'; cwd: string; title: string; message: string; confirmLabel: string; onConfirm: () => void }

interface GitPromptStore {
  prompt: GitPrompt | null
  open: (prompt: GitPrompt) => void
  close: () => void
}

export const useGitPromptStore = create<GitPromptStore>((set) => ({
  prompt: null,
  open: (prompt) => set({ prompt }),
  close: () => set({ prompt: null }),
}))

// Same gate as useForcePushConfirm: with the Git-settings safety toggle off,
// force push runs straight away; otherwise the existing confirm (with its
// countdown settings) is shown.
export function requestForcePush(action: ForceAction, cwd: string): void {
  if (!useGitSettingsStore.getState().forceSafetyEnabled) {
    void useGitStore.getState()[action](cwd)
    return
  }
  useGitPromptStore.getState().open({ kind: 'forcePush', action, cwd })
}
