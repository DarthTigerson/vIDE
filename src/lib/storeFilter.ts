// Filtering for the Store tab. Same filters, order and defaults as the
// vsuite.tech Store page (vsuite-store/src/lib/storeFilter.ts) so the two
// read the same: Category, Made by, Applications.
import type { StoreListing } from '@/types/api'

export type Maker = 'all' | 'vsuite' | 'community'
export type Category = 'all' | 'applications'

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

export function storeFilterCounts(apps: StoreListing[]) {
  return {
    category: {
      all: apps.length,
      applications: apps.filter((a) => a.category === 'applications').length,
    },
    maker: {
      all: apps.length,
      vsuite: apps.filter((a) => a.firstParty).length,
      community: apps.filter((a) => !a.firstParty).length,
    },
  }
}
