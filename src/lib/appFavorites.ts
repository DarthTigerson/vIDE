// Pure ordering rules for the left activity bar's apps (VIDE All Apps).
//
// File Tree, Search and Git are locked at the top and never appear here.
// Every other app is listed in the All Apps panel; favorites also sit on the
// bar, in the user's order. Disabled apps are filtered out by the caller
// before any of this runs, so they appear nowhere.

// Apps that can be favorited/unfavorited. Order here is the All Apps panel's
// order; new apps (e.g. future plugins) get appended and start unfavorited.
export const MOVABLE_APP_IDS = [
  'docker',
  'llama',
  'mobile',
  'graphify',
  'todos',
  'notes',
  'git-remote',
  'jira',
] as const

export type MovableAppId = (typeof MOVABLE_APP_IDS)[number]

export const DEFAULT_FAVORITES: MovableAppId[] = ['docker', 'llama']

// Drop target meaning "append to the end of the favorites" (the All Apps
// button itself, so there's always somewhere to drop even with no favorites).
export const APPEND_TARGET = 'apps'

export function isMovableAppId(id: string): id is MovableAppId {
  return (MOVABLE_APP_IDS as readonly string[]).includes(id)
}

// Drops unknown ids and duplicates from a stored list.
export function sanitizeFavorites(raw: unknown): MovableAppId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FAVORITES]
  const out: MovableAppId[] = []
  for (const id of raw) {
    if (typeof id === 'string' && isMovableAppId(id) && !out.includes(id)) out.push(id)
  }
  return out
}

// Moves `id` (already a favorite, or not yet) next to `targetId`. A target
// that isn't a favorite (e.g. APPEND_TARGET) appends to the end.
export function placeFavorite(
  favorites: MovableAppId[],
  id: string,
  targetId: string,
  placement: 'before' | 'after'
): MovableAppId[] {
  if (!isMovableAppId(id) || id === targetId) return favorites
  const without = favorites.filter((f) => f !== id)
  const targetIndex = without.indexOf(targetId as MovableAppId)
  if (targetIndex === -1) return [...without, id]
  const at = placement === 'before' ? targetIndex : targetIndex + 1
  return [...without.slice(0, at), id, ...without.slice(at)]
}

export function removeFavorite(favorites: MovableAppId[], id: string): MovableAppId[] {
  return favorites.includes(id as MovableAppId) ? favorites.filter((f) => f !== id) : favorites
}

// Splits the currently enabled apps into the bar's favorites (in favorite
// order) and the rest (in MOVABLE_APP_IDS order) — the candidates for the
// bar's temporary slot.
export function splitApps(
  enabled: readonly MovableAppId[],
  favorites: readonly MovableAppId[]
): { favorites: MovableAppId[]; others: MovableAppId[] } {
  return {
    favorites: favorites.filter((id) => enabled.includes(id)),
    others: MOVABLE_APP_IDS.filter((id) => enabled.includes(id) && !favorites.includes(id)),
  }
}
