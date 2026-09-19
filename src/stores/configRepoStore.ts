import { create } from 'zustand'
import { registerPushCallback, registerNotePushCallback } from '../lib/notifySettingChanged'

export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'pushing' | 'error'

export const DEFAULT_CATEGORIES: Record<string, boolean> = {
  general: true, models: true, git: true, docker: true,
  integrations: true, notes: true, todo: true, jira: true,
}

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
      if (prefixes.some((p) => key === p || key.startsWith(p))) kvMap[key] = val
    }
    result[cat] = kvMap
  }
  return result
}

export interface ConfigRepoStore {
  enabled: boolean
  repoUrl: string
  token: string
  categories: Record<string, boolean>
  status: SyncStatus
  lastSyncAt: number | null
  errorMessage: string | null
  loaded: boolean
  load: () => Promise<void>
  syncOnLaunch: () => Promise<void>
  setEnabled: (v: boolean) => void
  setRepoUrl: (v: string) => void
  setToken: (v: string) => void
  toggleCategory: (key: string) => void
  connect: () => Promise<void>
  push: () => Promise<void>
  schedulePush: () => void
  scheduleNotePush: () => void
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
let notePushTimer: ReturnType<typeof setTimeout> | null = null

export const useConfigRepoStore = create<ConfigRepoStore>((set, get) => ({
  enabled: false,
  repoUrl: '',
  token: '',
  categories: { ...DEFAULT_CATEGORIES },
  status: 'idle',
  lastSyncAt: null,
  errorMessage: null,
  loaded: false,

  load: async () => {
    const s = await window.api.configRepoGetSettings()
    set({
      enabled: s.enabled,
      repoUrl: s.repoUrl,
      token: s.token,
      categories: { ...DEFAULT_CATEGORIES, ...s.categories },
      status: s.enabled && s.repoUrl ? 'connected' : 'idle',
      loaded: true,
    })
  },

  syncOnLaunch: async () => {
    const s = await window.api.configRepoGetSettings()
    set({
      enabled: s.enabled,
      repoUrl: s.repoUrl,
      token: s.token,
      categories: { ...DEFAULT_CATEGORIES, ...s.categories },
      loaded: true,
    })

    if (!s.enabled || !s.repoUrl) {
      set({ status: 'idle' })
      return
    }

    // Pre-boot already pulled — just reflect the result in UI state.
    const { preMountSyncResult } = await import('../lib/preBootSync')
    set({ status: 'connected', lastSyncAt: preMountSyncResult.lastSyncAt })

    // Push immediately so the remote always has the union of both machines'
    // todos, notes, and settings after every launch — not just on changes.
    get().push()
  },

  setEnabled: (enabled) => {
    set({ enabled })
    window.api.configRepoSetSettings({ enabled })
  },

  setRepoUrl: (repoUrl) => { set({ repoUrl }); window.api.configRepoSetSettings({ repoUrl }) },
  setToken: (token) => { set({ token }); window.api.configRepoSetSettings({ token }) },

  toggleCategory: (key) => {
    const categories = { ...get().categories, [key]: !get().categories[key] }
    set({ categories })
    window.api.configRepoSetSettings({ categories })
  },

  connect: async () => {
    const { repoUrl, token } = get()
    set({ status: 'connecting', errorMessage: null })
    try {
      await window.api.configRepoConnect(repoUrl, token)
      set({ status: 'connected', enabled: true })
      window.api.configRepoSetSettings({ enabled: true })
    } catch (err) {
      set({ status: 'error', errorMessage: (err as Error).message })
    }
  },

  push: async () => {
    const { enabled, categories } = get()
    if (!enabled) return
    set({ status: 'pushing', errorMessage: null })
    try {
      await window.api.configRepoPush(gatherData(categories))
      set({ status: 'connected', lastSyncAt: Date.now() })
    } catch (err) {
      set({ status: 'error', errorMessage: (err as Error).message })
    }
  },

  schedulePush: () => {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      pushTimer = null
      useConfigRepoStore.getState().push()
    }, 2000)
  },

  scheduleNotePush: () => {
    if (notePushTimer) clearTimeout(notePushTimer)
    notePushTimer = setTimeout(() => {
      notePushTimer = null
      useConfigRepoStore.getState().push()
    }, 20000)
  },
}))

// Wire notifySettingChanged → schedulePush so stores don't need to
// import configRepoStore directly.
registerPushCallback(() => useConfigRepoStore.getState().schedulePush())
registerNotePushCallback(() => useConfigRepoStore.getState().scheduleNotePush())
