import { create } from 'zustand'

const ENABLED_KEY = 'vide:graphify:enabled'
const AUTO_BUILD_ON_OPEN_KEY = 'vide:graphify:autoBuildOnOpen'
const GITIGNORE_PROMPT_KEY = 'vide:graphify:gitignorePrompt'
const CLAUDE_SKILL_PROMPT_KEY = 'vide:graphify:claudeSkillPrompt'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface GraphifySettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  // Off by default (VIDE-27): building a graph spawns a real CLI process and
  // can take a while on a large repo, so it shouldn't fire silently in the
  // background for every repo someone opens unless they've opted in.
  autoBuildOnOpen: boolean
  setAutoBuildOnOpen: (value: boolean) => void
  // Raise a notification when a repo's built graphify-out/ isn't in its
  // .gitignore (useGraphifyGitignoreCheck / useNotificationItems).
  gitignorePrompt: boolean
  setGitignorePrompt: (value: boolean) => void
  // Raise a notification when a repo with a built graph doesn't have
  // graphify's Claude Code skill yet (useGraphifyPromptChecks).
  claudeSkillPrompt: boolean
  setClaudeSkillPrompt: (value: boolean) => void
}

export const useGraphifySettingsStore = create<GraphifySettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },

  autoBuildOnOpen: getBool(AUTO_BUILD_ON_OPEN_KEY, false),

  setAutoBuildOnOpen: (value) => {
    localStorage.setItem(AUTO_BUILD_ON_OPEN_KEY, String(value))
    set({ autoBuildOnOpen: value })
  },

  gitignorePrompt: getBool(GITIGNORE_PROMPT_KEY, true),

  setGitignorePrompt: (value) => {
    localStorage.setItem(GITIGNORE_PROMPT_KEY, String(value))
    set({ gitignorePrompt: value })
  },

  claudeSkillPrompt: getBool(CLAUDE_SKILL_PROMPT_KEY, true),

  setClaudeSkillPrompt: (value) => {
    localStorage.setItem(CLAUDE_SKILL_PROMPT_KEY, String(value))
    set({ claudeSkillPrompt: value })
  },
}))
