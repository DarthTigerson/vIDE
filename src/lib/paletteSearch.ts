export interface Searchable {
  label: string
  description?: string
  keywords?: string[]
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return needle.length === 0
}

// Strongest signal first: label prefix, then a word start, then anywhere in the
// label, then keyword prefix, then in-order letters, then weaker fields.
function scoreToken(token: string, item: Searchable): number {
  const label = item.label.toLowerCase()
  if (label.startsWith(token)) return 100
  if (words(item.label).some((w) => w.startsWith(token))) return 80
  if (label.includes(token)) return 60
  if (item.keywords?.some((k) => k.toLowerCase().startsWith(token))) return 40
  if (isSubsequence(token, label)) return 30
  if (item.keywords?.some((k) => k.toLowerCase().includes(token))) return 20
  if (item.description?.toLowerCase().includes(token)) return 10
  return 0
}

// Every whitespace-separated token must match somewhere ("git pu" =
// category "git" + name starting "pu"); the score is the sum.
export function scoreQuery(query: string, item: Searchable): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1
  let total = 0
  for (const token of tokens) {
    const score = scoreToken(token, item)
    if (score === 0) return 0
    total += score
  }
  return total
}

export function rankBySearch<T extends Searchable>(items: T[], query: string): T[] {
  if (!query.trim()) return items
  return items
    .map((item, index) => ({ item, index, score: scoreQuery(query, item) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.label.length - b.item.label.length ||
        a.index - b.index,
    )
    .map((entry) => entry.item)
}

export function withRecentsFirst<T extends { id: string }>(items: T[], recentIds: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const recent = recentIds.map((id) => byId.get(id)).filter((item): item is T => item !== undefined)
  const recentSet = new Set(recent.map((item) => item.id))
  return [...recent, ...items.filter((item) => !recentSet.has(item.id))]
}
