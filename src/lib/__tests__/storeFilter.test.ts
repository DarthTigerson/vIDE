import { describe, it, expect } from 'vitest'
import type { StoreListing } from '@/types/api'
import {
  DEFAULT_STORE_FILTERS, filterStoreApps, sortStoreApps, isDefaultStoreFilters, storeFilterCounts,
} from '../storeFilter'

function app(id: string, name: string, extra: Partial<StoreListing> = {}): StoreListing {
  return {
    id, name, description: `${name} app`, repo: `o/${id}`, firstParty: true, compatible: true,
    recommended: false, category: 'applications', targets: ['vide'],
    latest: { version: '1.0.0', commit: 'a'.repeat(40), url: 'https://x', sha256: 'b'.repeat(64), minVide: '0.4.0' },
    ...extra,
  }
}

const docker = app('docker', 'Docker', { recommended: true })
const notes = app('notes', 'Notes')
const other = app('other', 'Other', { targets: ['elsewhere'] })

describe('storeFilter', () => {
  it('keeps vIDE apps by default and drops apps for other targets', () => {
    expect(filterStoreApps([docker, notes, other], DEFAULT_STORE_FILTERS).map((a) => a.id)).toEqual(['docker', 'notes'])
  })

  it('shows every target when Applications is unticked', () => {
    expect(filterStoreApps([docker, other], { ...DEFAULT_STORE_FILTERS, targets: [] })).toHaveLength(2)
  })

  it('filters by search text over name and description', () => {
    expect(filterStoreApps([docker, notes], { ...DEFAULT_STORE_FILTERS, query: 'DOCK' }).map((a) => a.id)).toEqual(['docker'])
  })

  it('treats every phase-1 app as made by vSuite', () => {
    expect(filterStoreApps([docker], { ...DEFAULT_STORE_FILTERS, maker: 'community' })).toEqual([])
    expect(filterStoreApps([docker], { ...DEFAULT_STORE_FILTERS, maker: 'vsuite' })).toEqual([docker])
  })

  it('sorts recommended apps first, then by name', () => {
    expect(sortStoreApps([notes, app('alpha', 'alpha'), docker]).map((a) => a.id)).toEqual(['docker', 'alpha', 'notes'])
  })

  it('knows when filters are at their defaults', () => {
    expect(isDefaultStoreFilters(DEFAULT_STORE_FILTERS)).toBe(true)
    expect(isDefaultStoreFilters({ ...DEFAULT_STORE_FILTERS, maker: 'vsuite' })).toBe(false)
    expect(isDefaultStoreFilters({ ...DEFAULT_STORE_FILTERS, targets: [] })).toBe(false)
  })

  it('counts apps per filter row', () => {
    expect(storeFilterCounts([docker, notes])).toEqual({
      category: { all: 2, applications: 2 },
      maker: { all: 2, vsuite: 2, community: 0 },
    })
  })
})
