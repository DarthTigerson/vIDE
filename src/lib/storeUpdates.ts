import type { AppInfo, RegistryState, StoreListing } from '@/types/api'
import { isNewerVersion } from '@/lib/releaseNotes'

export const DISMISSED_UPDATES_KEY = 'vide:store:dismissedUpdates'

// One bell notice per app version, so dismissing 1.1.0 leaves 1.2.0 visible.
export function updateNoticeId(id: string, version: string): string {
  return `store-update-${id}-${version}`
}

// The one rule for "this app has an update": a store install that is running
// normally (not failed / waiting for a restart) with a newer compatible listing.
export function hasUpdate(listing: StoreListing | undefined, installed: AppInfo | undefined): boolean {
  if (!listing || !installed || installed.source !== 'store') return false
  if (installed.status !== 'loaded') return false
  return listing.compatible && isNewerVersion(listing.latest.version, installed.version)
}

// Installed store apps with a newer, compatible listing whose notice has not
// been dismissed. Dev apps never count (they are the developer's own build).
export function pendingUpdates(
  registry: RegistryState | null,
  installed: AppInfo[],
  dismissed: string[],
): { id: string; name: string; version: string }[] {
  if (registry?.status !== 'ok') return []
  const out: { id: string; name: string; version: string }[] = []
  for (const app of registry.apps) {
    if (!hasUpdate(app, installed.find((i) => i.id === app.id))) continue
    if (dismissed.includes(updateNoticeId(app.id, app.latest.version))) continue
    out.push({ id: app.id, name: app.name, version: app.latest.version })
  }
  return out
}

// Built-in apps that moved to the Store, and the localStorage key that held
// their Enable switch (set to 'true' by the user before the update).
export const BUILT_IN_ENABLED_KEYS: Record<string, string> = {
  docker: 'vide:docker:enabled',
}

// Per machine, not synced (outside every sync category prefix).
export const MOVED_NOTICE_DISMISSED_KEY = 'vide:store:movedNoticeDismissed'

export const MOVED_NOTICE_ID = 'store-moved-apps'

// Catalog apps that replace a built-in the user had enabled on this machine
// and have not installed yet. Empty until the catalog has loaded, and once
// the notice was dismissed.
export function movedApps(
  registry: RegistryState | null,
  installed: AppInfo[],
  readKey: (key: string) => string | null,
  dismissed: boolean,
): StoreListing[] {
  if (dismissed || registry?.status !== 'ok') return []
  return registry.apps.filter((app) => {
    const key = app.replacesBuiltIn ? BUILT_IN_ENABLED_KEYS[app.replacesBuiltIn] : undefined
    if (!key || readKey(key) !== 'true') return false
    return !installed.some((i) => i.id === app.id)
  })
}

export function readMovedNoticeDismissed(): boolean {
  try { return localStorage.getItem(MOVED_NOTICE_DISMISSED_KEY) === 'true' } catch { return false }
}

export function readLocalKey(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
