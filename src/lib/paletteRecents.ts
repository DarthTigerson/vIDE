const KEY = 'vide:palette:recents'
const MAX_RECENTS = 8

export function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function recordRecent(id: string): void {
  try {
    const next = [id, ...getRecents().filter((recent) => recent !== id)].slice(0, MAX_RECENTS)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Recents are a convenience; storage may be blocked or unavailable.
  }
}
