import { create } from 'zustand'
import type { ConflictCheckResult } from '../../electron/configRepo'

export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'syncing' | 'error'

export const DEFAULT_CATEGORIES: Record<string, boolean> = {
  general: true, models: true, git: true, docker: true,
  integrations: true, notes: true, todo: true, jira: true,
}

// Maps each category to the localStorage key prefixes that belong to it.
// A key matches if it equals a prefix exactly, or starts with it.
const CATEGORY_PREFIXES: Record<string, string[]> = {
  general: [
    'vide:general:', 'vide:theme', 'vide:themeMatchSystem',
    'vide:font', 'vide:panelStyle', 'vide:footerContent',
    'vide:memoryUsageVisible', 'vide:backgroundImage',
    'vide:backgroundImageVisible', 'vide:navbarPosition',
    'vide:editorColorScheme', 'vide:editor:', 'vide:commitMessage:',
    'vide:fontSize', 'vide:customTheme',
  ],
  models: [
    'vide:enabledModels', 'vide:bridge:', 'vide:autocomplete:',
    'vide:llama:', 'vide:llamaModels', 'vide:notificationSound:',
  ],
  git: ['vide:git:', 'vide:gitRemote:', 'vide:gitFavoriteRepos', 'vide:gitFavorites:'],
  docker: ['vide:docker:'],
  integrations: [
    'vide:lsp:', 'vide:inlineEdit:', 'vide:graphify:',
    'vide:mobile:', 'vide:browser:', 'vide:browserMcp:',
  ],
  notes: ['vide:notes:', 'vide:notesMcp'],
  todo: ['vide:todo:', 'vide:todoMcp'],
  jira: ['vide:jira:'],
}

function gatherData(
  categories: Record<string, boolean>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const [cat, enabled] of Object.entries(categories)) {
    if (!enabled) continue
    const prefixes = CATEGORY_PREFIXES[cat] ?? []
    const kvMap: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      const val = localStorage.getItem(key)
      if (val === null) continue
      if (prefixes.some((p) => key === p || key.startsWith(p))) {
        kvMap[key] = val
      }
    }
    result[cat] = kvMap
  }
  return result
}

function applyResolutions(
  localData: Record<string, Record<string, string>>,
  conflicts: ConflictCheckResult,
  resolutions: Record<string, 'local' | 'remote'>,
): Record<string, Record<string, string>> {
  const resolved: Record<string, Record<string, string>> = { ...localData }
  for (const [cat, choice] of Object.entries(resolutions)) {
    const entry = conflicts.conflicts[cat]
    if (!entry) continue
    resolved[cat] = choice === 'local' ? entry.localData : entry.remoteData
  }
  return resolved
}

export interface ConfigRepoStore {
  // Persisted config
  enabled: boolean
  repoUrl: string
  token: string
  categories: Record<string, boolean>
  saveRateMinutes: number
  // Runtime
  status: SyncStatus
  lastSyncAt: number | null
  errorMessage: string | null
  loaded: boolean
  // Conflict resolution state — set when sync detects differences
  pendingConflicts: ConflictCheckResult | null
  pendingLocalData: Record<string, Record<string, string>> | null
  // Actions
  load: () => Promise<void>
  setEnabled: (v: boolean) => void
  setRepoUrl: (v: string) => void
  setToken: (v: string) => void
  toggleCategory: (key: string) => void
  setSaveRateMinutes: (v: number) => void
  connect: () => Promise<void>
  sync: () => Promise<void>
  resolveConflicts: (resolutions: Record<string, 'local' | 'remote'>) => Promise<void>
  dismissConflicts: () => void
}

let autoSaveTimer: ReturnType<typeof setInterval> | null = null

function rescheduleAutoSave(getStore: () => ConfigRepoStore): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
  const { enabled, status, saveRateMinutes } = getStore()
  if (!enabled || status !== 'connected') return
  autoSaveTimer = setInterval(() => {
    getStore().sync()
  }, saveRateMinutes * 60 * 1000)
}

export const useConfigRepoStore = create<ConfigRepoStore>((set, get) => ({
  enabled: false,
  repoUrl: '',
  token: '',
  categories: { ...DEFAULT_CATEGORIES },
  saveRateMinutes: 5,
  status: 'idle',
  lastSyncAt: null,
  errorMessage: null,
  loaded: false,
  pendingConflicts: null,
  pendingLocalData: null,

  load: async () => {
    const s = await window.api.configRepoGetSettings()
    set({
      enabled: s.enabled,
      repoUrl: s.repoUrl,
      token: s.token,
      categories: { ...DEFAULT_CATEGORIES, ...s.categories },
      saveRateMinutes: s.saveRateMinutes,
      status: s.enabled && s.repoUrl ? 'connected' : 'idle',
      loaded: true,
    })
    rescheduleAutoSave(get)
  },

  setEnabled: (enabled) => {
    set({ enabled })
    window.api.configRepoSetSettings({ enabled })
    rescheduleAutoSave(get)
  },

  setRepoUrl: (repoUrl) => {
    set({ repoUrl })
    window.api.configRepoSetSettings({ repoUrl })
  },

  setToken: (token) => {
    set({ token })
    window.api.configRepoSetSettings({ token })
  },

  toggleCategory: (key) => {
    const categories = { ...get().categories, [key]: !get().categories[key] }
    set({ categories })
    window.api.configRepoSetSettings({ categories })
  },

  setSaveRateMinutes: (saveRateMinutes) => {
    set({ saveRateMinutes })
    window.api.configRepoSetSettings({ saveRateMinutes })
    rescheduleAutoSave(get)
  },

  connect: async () => {
    const { repoUrl, token } = get()
    set({ status: 'connecting', errorMessage: null })
    try {
      await window.api.configRepoConnect(repoUrl, token)
      set({ status: 'connected', enabled: true })
      window.api.configRepoSetSettings({ enabled: true })
      rescheduleAutoSave(get)
    } catch (err) {
      set({ status: 'error', errorMessage: (err as Error).message })
    }
  },

  sync: async () => {
    const { categories } = get()
    set({ status: 'syncing', errorMessage: null })
    try {
      const localData = gatherData(categories)
      const conflictResult = await window.api.configRepoCheckConflicts(localData)

      if (conflictResult.hasConflicts) {
        // Surface to UI for user resolution — stay in syncing→idle so the
        // status pill doesn't show an error (this is expected, not broken)
        set({ status: 'connected', pendingConflicts: conflictResult, pendingLocalData: localData })
        return
      }

      await window.api.configRepoSync(localData)
      set({ status: 'connected', lastSyncAt: Date.now() })
    } catch (err) {
      set({ status: 'error', errorMessage: (err as Error).message })
    }
  },

  resolveConflicts: async (resolutions) => {
    const { pendingConflicts, pendingLocalData } = get()
    if (!pendingConflicts || !pendingLocalData) return
    set({ status: 'syncing', pendingConflicts: null, pendingLocalData: null, errorMessage: null })
    try {
      const resolvedData = applyResolutions(pendingLocalData, pendingConflicts, resolutions)
      await window.api.configRepoSync(resolvedData)
      set({ status: 'connected', lastSyncAt: Date.now() })
    } catch (err) {
      set({ status: 'error', errorMessage: (err as Error).message })
    }
  },

  dismissConflicts: () => {
    set({ pendingConflicts: null, pendingLocalData: null })
  },
}))
