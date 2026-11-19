// Pure ordering rules for the left activity bar's apps (VIDE All Apps).
//
// File Tree, Search and Git are locked at the top and never appear here.
// Every other app is listed in the All Apps panel; favorites also sit on the
// bar, in the user's order. Disabled apps are filtered out by the caller
// before any of this runs, so they appear nowhere.

// Apps that can be favorited/unfavorited. Order here is the All Apps panel's
// order; new apps (e.g. future plugins) get appended and start unfavorited.
export const MOVABLE_APP_IDS = [
  'llama',
  'mobile',
  'graphify',
  'todos',
  'notes',
  'scripts',
] as const

export type MovableAppId = (typeof MOVABLE_APP_IDS)[number]

// A favorite is a built-in app or an installed store app (`app:<appId>`).
export type FavoriteId = MovableAppId | `app:${string}`

export const DEFAULT_FAVORITES: FavoriteId[] = ['llama']

// Built-ins that moved to the Store keep their favorite slot: a stored id is
// rewritten to the store app's id, so the star and bar position carry over
// once the app is installed (until then the slot is simply not shown).
const MOVED_TO_STORE: Record<string, FavoriteId> = { docker: 'app:docker', 'git-remote': 'app:gitpage' }

// Drop target meaning "append to the end of the favorites" (the All Apps
// button itself, so there's always somewhere to drop even with no favorites).
export const APPEND_TARGET = 'apps'

export function isMovableAppId(id: string): id is MovableAppId {
  return (MOVABLE_APP_IDS as readonly string[]).includes(id)
}

export function isFavoriteId(id: string): id is FavoriteId {
  return isMovableAppId(id) || (id.startsWith('app:') && id.length > 4)
}

// Drops unknown ids and duplicates from a stored list, and carries moved
// built-ins over to their store app. Idempotent.
export function sanitizeFavorites(raw: unknown): FavoriteId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FAVORITES]
  const out: FavoriteId[] = []
  for (const stored of raw) {
    if (typeof stored !== 'string') continue
    const id = MOVED_TO_STORE[stored] ?? stored
    if (isFavoriteId(id) && !out.includes(id)) out.push(id)
  }
  return out
}

// Moves `id` (already a favorite, or not yet) next to `targetId`. A target
// that isn't a favorite (e.g. APPEND_TARGET) appends to the end.
export function placeFavorite(
  favorites: FavoriteId[],
  id: string,
  targetId: string,
  placement: 'before' | 'after'
): FavoriteId[] {
  if (!isFavoriteId(id) || id === targetId) return favorites
  const without = favorites.filter((f) => f !== id)
  const targetIndex = without.indexOf(targetId as FavoriteId)
  if (targetIndex === -1) return [...without, id]
  const at = placement === 'before' ? targetIndex : targetIndex + 1
  return [...without.slice(0, at), id, ...without.slice(at)]
}

export function removeFavorite(favorites: FavoriteId[], id: string): FavoriteId[] {
  return favorites.includes(id as FavoriteId) ? favorites.filter((f) => f !== id) : favorites
}

// The unfavorited app in the bar's temporary slot: the active one if there
// is one, else the last one that was, so you can jump back to it. It goes
// once it's favorited or disabled (no longer in `others`).
export function pickTemporaryApp<T extends string>(
  others: readonly T[],
  activeId: T | undefined,
  lastId: string | null
): T | null {
  if (activeId && others.includes(activeId)) return activeId
  return others.find((id) => id === lastId) ?? null
}

// Splits the currently enabled apps (built-ins and `app:<id>` store apps)
// into the bar's favorites (in favorite order) and the rest — built-ins in
// MOVABLE_APP_IDS order, then store apps in the order given — the candidates
// for the bar's temporary slot.
export function splitApps(
  enabled: readonly string[],
  favorites: readonly string[]
): { favorites: string[]; others: string[] } {
  const rest = enabled.filter((id) => !favorites.includes(id))
  return {
    favorites: favorites.filter((id) => enabled.includes(id)),
    others: [
      ...MOVABLE_APP_IDS.filter((id) => rest.includes(id)),
      ...rest.filter((id) => !isMovableAppId(id)),
    ],
  }
}
