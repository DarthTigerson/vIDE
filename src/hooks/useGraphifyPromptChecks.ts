import { useEffect } from 'react'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useGraphifyStore } from '@/stores/graphifyStore'

// Whenever a repo becomes active, checks whether its graphify-out/ still
// needs gitignoring and whether graphify's Claude Code skill still needs
// setting up; graphifyStore.run() re-checks both after each successful
// build. Each one that applies raises a notification whose click fixes it
// (see useNotificationItems). Each check is skipped while its reminder is off.
export function useGraphifyPromptChecks(activeRepo: string | null) {
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  const gitignorePrompt = useGraphifySettingsStore((s) => s.gitignorePrompt)
  const claudeSkillPrompt = useGraphifySettingsStore((s) => s.claudeSkillPrompt)

  useEffect(() => {
    if (!graphifyEnabled || !gitignorePrompt || !activeRepo) return
    useGraphifyStore.getState().checkGitignore(activeRepo)
  }, [graphifyEnabled, gitignorePrompt, activeRepo])

  useEffect(() => {
    if (!graphifyEnabled || !claudeSkillPrompt || !activeRepo) return
    useGraphifyStore.getState().checkClaudeSkill(activeRepo)
  }, [graphifyEnabled, claudeSkillPrompt, activeRepo])
}
