import type { MovableAppId } from './appFavorites'
import {
  GRAPHIFY_SETTINGS_TAB_PATH,
  LLAMA_SETTINGS_TAB_PATH,
  MOBILE_SETTINGS_TAB_PATH,
  NOTES_SETTINGS_TAB_PATH,
  SCRIPTS_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH,
} from '@/components/Settings/paths'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useMobileSettingsStore } from '@/stores/mobileSettingsStore'
import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'
import { useTodoSettingsStore } from '@/stores/todoSettingsStore'

// The settings page each app's right-click "Settings" opens.
export const APP_SETTINGS_PATHS: Record<MovableAppId, string> = {
  llama: LLAMA_SETTINGS_TAB_PATH,
  mobile: MOBILE_SETTINGS_TAB_PATH,
  graphify: GRAPHIFY_SETTINGS_TAB_PATH,
  todos: TODO_SETTINGS_TAB_PATH,
  notes: NOTES_SETTINGS_TAB_PATH,
  scripts: SCRIPTS_SETTINGS_TAB_PATH,
}

// Sets an app's Enable switch, the same as flipping it on its settings page.
export function appEnabledSetter(id: MovableAppId): (enabled: boolean) => void {
  switch (id) {
    case 'llama': return useLlamaSettingsStore.getState().setEnabled
    case 'mobile': return useMobileSettingsStore.getState().setEnabled
    case 'graphify': return useGraphifySettingsStore.getState().setEnabled
    case 'todos': return useTodoSettingsStore.getState().setEnabled
    case 'notes': return useNotesSettingsStore.getState().setEnabled
    case 'scripts': return useScriptsSettingsStore.getState().setEnabled
  }
}
