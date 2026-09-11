import { useState } from 'react'
import { useGitStore } from '@/stores/gitStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import type { GitCommandAction } from '@/types/index'

type ForceAction = Extract<GitCommandAction, 'forcePush' | 'forcePushLease'>

// Shared by GitActionsMenu (footer) and RepoSection (the Git panel's per-repo
// accordion section) — both trigger the same two destructive push variants and
// need the same safety-setting gate.
export function useForcePushConfirm(projectRoot: string | null) {
  const forceSafetyEnabled = useGitSettingsStore((s) => s.forceSafetyEnabled)
  const [forceAction, setForceAction] = useState<ForceAction | null>(null)

  function requestForce(action: ForceAction) {
    if (!forceSafetyEnabled) {
      const fn = useGitStore.getState()[action]
      if (projectRoot) fn(projectRoot)
    } else {
      setForceAction(action)
    }
  }

  return { forceAction, requestForce, closeForce: () => setForceAction(null) }
}
