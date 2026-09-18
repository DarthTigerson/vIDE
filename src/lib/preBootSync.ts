import type { SyncResult } from '../../electron/configRepo'

// Same category → prefix mapping as configRepoStore.ts (kept in sync manually).
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

function gatherLocalData(
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

function applyToLocalStorage(data: Record<string, Record<string, string>>): void {
  for (const kvMap of Object.values(data)) {
    for (const [key, val] of Object.entries(kvMap)) {
      try { localStorage.setItem(key, val) } catch {}
    }
  }
}

// Exposed so configRepoStore can read the result without re-syncing.
export const preMountSyncResult: {
  done: boolean
  conflicts: SyncResult | null
  lastSyncAt: number | null
  pushFailed: boolean
  pushError?: string
} = { done: false, conflicts: null, lastSyncAt: null, pushFailed: false }

export async function runPreMountSync(): Promise<void> {
  try {
    const settings = await window.api.configRepoGetSettings()
    if (!settings.enabled || !settings.repoUrl) {
      preMountSyncResult.done = true
      return
    }

    const localData = gatherLocalData(settings.categories)
    const result = await window.api.configRepoSync(localData)

    if (!result.hasConflicts) {
      // Apply merged settings even if push failed — local state is still correct.
      applyToLocalStorage(result.merged)
      preMountSyncResult.lastSyncAt = Date.now()
      if (result.pushFailed) {
        preMountSyncResult.pushFailed = true
        preMountSyncResult.pushError = result.pushError
        console.error('[vIDE sync] Push failed during pre-boot sync:', result.pushError)
      }
    } else {
      preMountSyncResult.conflicts = result
    }
  } catch (e) {
    console.error('[vIDE sync] Pre-boot sync error:', e)
    // App continues with existing localStorage values
  }
  preMountSyncResult.done = true
}
