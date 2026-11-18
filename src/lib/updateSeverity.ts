// Renderer-side helpers for update severity (see electron/updateChecker.ts).

// Set once a critical release is seen; on the next launch main.tsx shows the
// Update required wall instead of the app until vIDE is at least this
// version. Deliberately outside every vIDE Sync prefix (configRepoStore's
// CATEGORY_PREFIXES): it describes this machine's install, not a setting.
export const REQUIRED_VERSION_KEY = 'vide:update:requiredVersion'

// How long Snooze hides an urgent update notification.
export const SNOOZE_MS = 60 * 60 * 1000

// Same ordering as electron/updateChecker.ts's compareVersions, which can't
// be imported here (that module pulls in electron's ipcMain).
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function rememberRequiredVersion(version: string): void {
  try {
    const existing = localStorage.getItem(REQUIRED_VERSION_KEY)
    if (!existing || compareVersions(version, existing) > 0) localStorage.setItem(REQUIRED_VERSION_KEY, version)
  } catch { /* storage unavailable: the urgent notification still shows */ }
}

// The version this install must update to before the app may load, or null.
// Clears the mark once the installed version has caught up.
export function requiredUpdateVersion(currentVersion: string): string | null {
  try {
    const required = localStorage.getItem(REQUIRED_VERSION_KEY)
    if (!required) return null
    if (compareVersions(required, currentVersion) > 0) return required
    localStorage.removeItem(REQUIRED_VERSION_KEY)
  } catch { /* storage unavailable */ }
  return null
}
