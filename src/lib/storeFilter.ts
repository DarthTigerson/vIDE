// Filtering for the Store tab. Same filters, order and defaults as the
// vsuite.tech Store page (vsuite-store/src/lib/storeFilter.ts) so the two
// read the same: Category, Made by, Applications.
import type { LanguageServerEntry, StoreListing } from '@/types/api'

export type Maker = 'all' | 'vsuite' | 'community'
export type Category = 'all' | 'applications' | 'agent-tools' | 'language-servers'

export interface StoreFilters {
  query: string
  category: Category
  maker: Maker
  /** Selected targets; an app must target at least one. Empty = no target filter. */
  targets: string[]
}

export const DEFAULT_STORE_FILTERS: StoreFilters = { query: '', category: 'all', maker: 'all', targets: ['vide'] }

export function filterStoreApps(apps: StoreListing[], f: StoreFilters): StoreListing[] {
  const q = f.query.trim().toLowerCase()
  return apps.filter((a) =>
    (f.category === 'all' || a.category === f.category) &&
    (f.maker === 'all' || (f.maker === 'vsuite') === a.firstParty) &&
    (f.targets.length === 0 || f.targets.some((t) => a.targets.includes(t))) &&
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
    (f.targets.length === 0 || f.targets.some((t) => l.targets.includes(t))) &&
    (!q || `${l.name} ${l.description} ${l.languages.join(' ')}`.toLowerCase().includes(q)),
  )
}

// Recommended first, then by name.
export function sortStoreApps(apps: StoreListing[]): StoreListing[] {
  return apps.slice().sort((a, b) =>
    Number(b.recommended) - Number(a.recommended) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function isDefaultStoreFilters(f: StoreFilters): boolean {
  return f.query.trim() === '' && f.category === 'all' && f.maker === 'all' &&
    f.targets.length === DEFAULT_STORE_FILTERS.targets.length &&
    f.targets.every((t) => DEFAULT_STORE_FILTERS.targets.includes(t))
}

export function storeFilterCounts(apps: StoreListing[], languageServers: LanguageServerEntry[] = []) {
  return {
    category: {
      all: apps.length + languageServers.length,
      applications: apps.filter((a) => a.category === 'applications').length,
      'agent-tools': apps.filter((a) => a.category === 'agent-tools').length,
      'language-servers': languageServers.length,
    },
    maker: {
      all: apps.length,
      vsuite: apps.filter((a) => a.firstParty).length,
      community: apps.filter((a) => !a.firstParty).length,
    },
  }
}
