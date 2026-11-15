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
