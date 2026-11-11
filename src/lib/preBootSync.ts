// Runs before App loads. Pulls remote settings and writes them to localStorage
// so every store initializes from the correct values on first import.

import { findIncompatibleSyncValue } from './syncCompat'

export const preMountSyncResult: {
  done: boolean
  lastSyncAt: number | null
  // True when the remote config was written by a newer, incompatible vIDE.
  // main.tsx renders the update wall instead of App when this is set (VIDE-162).
  incompatible: boolean
} = { done: false, lastSyncAt: null, incompatible: false }

// Applies a safe default look and freezes sync so an out-of-date build can't
// apply — or push back over — config it doesn't understand. Called when either
// the schema stamp or a synced value says the remote is from a newer vIDE.
function gate(): void {
  preMountSyncResult.incompatible = true
  // Default to the vIDE theme with no background image — the pulled values are
  // untrusted, and this is the look the update wall shows.
  try {
    localStorage.setItem('vide:theme', 'thomas-dark')
    localStorage.setItem('vide:themeMatchSystem', 'false')
    localStorage.setItem('vide:backgroundImage', 'none')
    document.documentElement.setAttribute('data-theme', 'thomas-dark')
  } catch {}
  // Stop this machine pushing its older config over the newer machine's.
  window.api.configRepoSetGated(true).catch(() => {})
  preMountSyncResult.done = true
}

export async function runPreMountSync(): Promise<void> {
  try {
    const settings = await window.api.configRepoGetSettings()
    if (!settings.enabled || !settings.repoUrl) {
      preMountSyncResult.done = true
      return
    }

    // Schema gate: if the repo was last written by a newer vIDE, refuse the
    // whole pull — don't even merge the file-based categories — and show the
    // wall. Checked before pulling so nothing from the newer config touches disk.
    const [localVer, remoteVer] = await Promise.all([
      window.api.configRepoGetSchemaVersion(),
      window.api.configRepoGetRemoteSchemaVersion(),
    ])
    if (remoteVer > localVer) {
      gate()
      return
    }

    const remoteData = await window.api.configRepoPull(settings.categories)

    // Value gate: catches a newer build that added an enum option without
    // bumping the schema version. An unknown value here is what historically
    // crashed startup, so reject it rather than write it to localStorage.
    if (findIncompatibleSyncValue(remoteData)) {
      gate()
      return
    }

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
