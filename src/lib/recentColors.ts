const STORAGE_KEY = 'vide:recentColors'
const MAX_RECENT = 8

export function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function addRecentColor(hex: string): string[] {
  const next = [hex, ...getRecentColors().filter((c) => c !== hex)].slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
