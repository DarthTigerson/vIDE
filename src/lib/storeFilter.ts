// Filtering for the Store tab. Same filters, order and defaults as the
// vsuite.tech Store page (vsuite-store/src/lib/storeFilter.ts) so the two
// read the same: Category, Made by. Only vIDE's own listings are shown here
// (see forVide); the site's Applications filter has no place inside vIDE.
import type { LanguageServerEntry, StoreListing } from '@/types/api'

export type Maker = 'all' | 'vsuite' | 'community'
export type Category = 'all' | 'applications' | 'agent-tools' | 'usage' | 'language-servers'

export interface StoreFilters {
  query: string
  category: Category
  maker: Maker
}

export const DEFAULT_STORE_FILTERS: StoreFilters = { query: '', category: 'all', maker: 'all' }

// The catalog also lists apps for other vSuite applications; vIDE's Store
// shows only its own.
export function forVide<T extends { targets: string[] }>(items: T[]): T[] {
  return items.filter((i) => i.targets.includes('vide'))
}

export function filterStoreApps(apps: StoreListing[], f: StoreFilters): StoreListing[] {
  const q = f.query.trim().toLowerCase()
  return apps.filter((a) =>
    (f.category === 'all' || a.category === f.category) &&
    (f.maker === 'all' || (f.maker === 'vsuite') === a.firstParty) &&
    (!q || `${a.name} ${a.description}`.toLowerCase().includes(q)),
  )
}

// Language servers come from the catalog's own list, not `apps`. They are
// curated pointers to upstream servers, not made by vSuite or the community,
// so any Made by choice other than Everyone hides them.
export function filterLanguageServers(list: LanguageServerEntry[], f: StoreFilters): LanguageServerEntry[] {
  const q = f.query.trim().toLowerCase()
  return list.filter((l) =>
    (f.category === 'all' || f.category === 'language-servers') &&
    f.maker === 'all' &&
    (!q || `${l.name} ${l.description} ${l.languages.join(' ')}`.toLowerCase().includes(q)),
  )
}

// Apps and language servers as one list: recommended first, then by name
// (language servers are never recommended). `apps` is already sorted.
export type StoreItem = { kind: 'app'; app: StoreListing } | { kind: 'server'; server: LanguageServerEntry }

export function mergeStoreItems(apps: StoreListing[], servers: LanguageServerEntry[]): StoreItem[] {
  const items: StoreItem[] = [
    ...apps.map((app) => ({ kind: 'app' as const, app })),
    ...servers.map((server) => ({ kind: 'server' as const, server })),
  ]
  const rec = (i: StoreItem) => (i.kind === 'app' ? Number(i.app.recommended) : 0)
  const name = (i: StoreItem) => (i.kind === 'app' ? i.app.name : i.server.name)
  return items.sort((a, b) => rec(b) - rec(a) || name(a).localeCompare(name(b), undefined, { sensitivity: 'base' }))
}

// Recommended first, then by name.
export function sortStoreApps(apps: StoreListing[]): StoreListing[] {
  return apps.slice().sort((a, b) =>
    Number(b.recommended) - Number(a.recommended) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function isDefaultStoreFilters(f: StoreFilters): boolean {
  return f.query.trim() === '' && f.category === 'all' && f.maker === 'all'
}

export function storeFilterCounts(apps: StoreListing[], languageServers: LanguageServerEntry[] = []) {
  return {
    category: {
      all: apps.length + languageServers.length,
      applications: apps.filter((a) => a.category === 'applications').length,
      'agent-tools': apps.filter((a) => a.category === 'agent-tools').length,
      usage: apps.filter((a) => a.category === 'usage').length,
      'language-servers': languageServers.length,
    },
    maker: {
      all: apps.length,
      vsuite: apps.filter((a) => a.firstParty).length,
      community: apps.filter((a) => !a.firstParty).length,
    },
  }
}
