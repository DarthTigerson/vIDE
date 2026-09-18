// Runs before App loads. Pulls remote settings and writes them to localStorage
// so every store initializes from the correct values on first import.

export const preMountSyncResult: {
  done: boolean
  lastSyncAt: number | null
} = { done: false, lastSyncAt: null }

export async function runPreMountSync(): Promise<void> {
  try {
    const settings = await window.api.configRepoGetSettings()
    if (!settings.enabled || !settings.repoUrl) {
      preMountSyncResult.done = true
      return
    }

    const remoteData = await window.api.configRepoPull(settings.categories)

    // Remote is source of truth — write its values directly.
    for (const kvMap of Object.values(remoteData)) {
      for (const [key, val] of Object.entries(kvMap)) {
        try { localStorage.setItem(key, val) } catch {}
      }
    }
    preMountSyncResult.lastSyncAt = Date.now()
  } catch (e) {
    console.error('[vIDE sync] Pre-boot pull error:', e)
  }
  preMountSyncResult.done = true
}
