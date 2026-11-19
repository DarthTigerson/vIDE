import type { AppInfo, RegistryState, StoreListing } from '@/types/api'
import { isNewerVersion } from '@/lib/releaseNotes'

export const DISMISSED_UPDATES_KEY = 'vide:store:dismissedUpdates'

// One bell notice per app version, so dismissing 1.1.0 leaves 1.2.0 visible.
export function updateNoticeId(id: string, version: string): string {
  return `store-update-${id}-${version}`
}

// The one rule for "this app has an update": a store install that is running
// normally (not failed / waiting for a restart; switched off still counts) with
// a newer compatible listing.
export function hasUpdate(listing: StoreListing | undefined, installed: AppInfo | undefined): boolean {
  if (!listing || !installed || installed.source !== 'store') return false
  if (installed.status !== 'loaded' && installed.status !== 'disabled') return false
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
// their Enable switch (set to 'true' by the user before the update). `true`
// means the built-in had no switch: every user had it.
export const BUILT_IN_ENABLED_KEYS: Record<string, string | true> = {
  docker: 'vide:docker:enabled',
  // The core web-search toggle (removed with vide-search); the DuckDuckGo app replaces it.
  'web-search': 'vide:search:mcpEnabled',
  // The Git panel's remote launcher; the Git Page app replaces it.
  'git-remote': true,
}

// Per machine, not synced (outside every sync category prefix). A JSON list
// of the built-in ids (replacesBuiltIn values) whose notice was dismissed, so
// a later move still gets its own notice. Older builds stored 'true'.
export const MOVED_NOTICE_DISMISSED_KEY = 'vide:store:movedNoticeDismissed'

export const MOVED_NOTICE_ID = 'store-moved-apps'

// Catalog apps that replace a built-in the user had enabled on this machine
// and have not installed yet. Empty until the catalog has loaded, and once
// the notice was dismissed for that built-in.
export function movedApps(
  registry: RegistryState | null,
  installed: AppInfo[],
  readKey: (key: string) => string | null,
  dismissed: readonly string[],
): StoreListing[] {
  if (registry?.status !== 'ok') return []
  return registry.apps.filter((app) => {
    if (!app.replacesBuiltIn || dismissed.includes(app.replacesBuiltIn)) return false
    const key = BUILT_IN_ENABLED_KEYS[app.replacesBuiltIn]
    if (key === undefined || (key !== true && readKey(key) !== 'true')) return false
    return !installed.some((i) => i.id === app.id)
  })
}

// The legacy 'true' dismissed the notice when only these built-ins had moved.
const LEGACY_DISMISSED = ['docker', 'web-search']

export function parseMovedNoticeDismissed(raw: string | null): string[] {
  if (raw === 'true') return [...LEGACY_DISMISSED]
  try {
    const v: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function readMovedNoticeDismissed(): string[] {
  try { return parseMovedNoticeDismissed(localStorage.getItem(MOVED_NOTICE_DISMISSED_KEY)) } catch { return [] }
}

export function readLocalKey(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
