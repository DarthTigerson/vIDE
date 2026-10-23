import type { MovableAppId } from './appFavorites'
import {
  DOCKER_SETTINGS_TAB_PATH,
  GIT_SETTINGS_TAB_PATH,
  GRAPHIFY_SETTINGS_TAB_PATH,
  JIRA_SETTINGS_TAB_PATH,
  LLAMA_SETTINGS_TAB_PATH,
  MOBILE_SETTINGS_TAB_PATH,
  NOTES_SETTINGS_TAB_PATH,
  SCRIPTS_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH,
} from '@/components/Settings/paths'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useJiraSettingsStore } from '@/stores/jiraSettingsStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useMobileSettingsStore } from '@/stores/mobileSettingsStore'
import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'
import { useTodoSettingsStore } from '@/stores/todoSettingsStore'

// The settings page each app's right-click "Settings" opens. The GitHub/GitLab
// app is configured from Settings: Git (its remote URL lives there).
export const APP_SETTINGS_PATHS: Record<MovableAppId, string> = {
  docker: DOCKER_SETTINGS_TAB_PATH,
  llama: LLAMA_SETTINGS_TAB_PATH,
  mobile: MOBILE_SETTINGS_TAB_PATH,
  graphify: GRAPHIFY_SETTINGS_TAB_PATH,
  todos: TODO_SETTINGS_TAB_PATH,
  notes: NOTES_SETTINGS_TAB_PATH,
  scripts: SCRIPTS_SETTINGS_TAB_PATH,
  'git-remote': GIT_SETTINGS_TAB_PATH,
  jira: JIRA_SETTINGS_TAB_PATH,
}

// Turns an app's Enable switch off, the same as doing it from its settings
// page. null for the GitHub/GitLab app: it has no switch, it shows whenever a
// remote URL is set.
export function appDisabler(id: MovableAppId): (() => void) | null {
  switch (id) {
    case 'docker': return () => useDockerSettingsStore.getState().setEnabled(false)
    case 'llama': return () => useLlamaSettingsStore.getState().setEnabled(false)
    case 'mobile': return () => useMobileSettingsStore.getState().setEnabled(false)
    case 'graphify': return () => useGraphifySettingsStore.getState().setEnabled(false)
    case 'todos': return () => useTodoSettingsStore.getState().setEnabled(false)
    case 'notes': return () => useNotesSettingsStore.getState().setEnabled(false)
    case 'scripts': return () => useScriptsSettingsStore.getState().setEnabled(false)
    case 'jira': return () => useJiraSettingsStore.getState().setEnabled(false)
    case 'git-remote': return null
  }
}
