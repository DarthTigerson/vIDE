import { describe, it, expect } from 'vitest'
import type { StoreListing } from '@/types/api'
import {
  DEFAULT_STORE_FILTERS, filterLanguageServers, filterStoreApps, mergeStoreItems, sortStoreApps, isDefaultStoreFilters, storeFilterCounts,
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

  it('counts and filters the agent-tools category', () => {
    const tool = { ...docker, id: 'ddg', category: 'agent-tools' }
    expect(storeFilterCounts([docker, tool]).category).toEqual({ all: 2, applications: 1, 'agent-tools': 1, usage: 0, 'language-servers': 0 })
    expect(filterStoreApps([docker, tool], { ...DEFAULT_STORE_FILTERS, category: 'agent-tools' }).map((a) => a.id)).toEqual(['ddg'])
  })

  it('counts and filters the usage category', () => {
    const look = { ...docker, id: 'bike-gauge', category: 'usage' }
    expect(storeFilterCounts([docker, look]).category.usage).toBe(1)
    expect(filterStoreApps([docker, look], { ...DEFAULT_STORE_FILTERS, category: 'usage' }).map((a) => a.id)).toEqual(['bike-gauge'])
  })

  it('counts apps per filter row', () => {
    expect(storeFilterCounts([docker, notes])).toEqual({
      category: { all: 2, applications: 2, 'agent-tools': 0, usage: 0, 'language-servers': 0 },
      maker: { all: 2, vsuite: 2, community: 0 },
    })
  })

  it('language servers: own category, hidden by any Made by choice, searchable by language', () => {
    const go = {
      id: 'go', name: 'Go', description: 'gopls.', targets: ['vide'], languages: ['go'], binary: 'gopls',
      args: [], versionArgs: ['version'], install: { method: 'go' as const, package: 'golang.org/x/tools/gopls@latest' },
    }
    expect(storeFilterCounts([docker], [go]).category).toEqual({ all: 2, applications: 1, 'agent-tools': 0, usage: 0, 'language-servers': 1 })
    expect(filterStoreApps([docker], { ...DEFAULT_STORE_FILTERS, category: 'language-servers' })).toEqual([])
    expect(filterLanguageServers([go], { ...DEFAULT_STORE_FILTERS, category: 'language-servers' })).toEqual([go])
    expect(filterLanguageServers([go], { ...DEFAULT_STORE_FILTERS, category: 'applications' })).toEqual([])
    expect(filterLanguageServers([go], { ...DEFAULT_STORE_FILTERS, maker: 'vsuite' })).toEqual([])
    expect(filterLanguageServers([go], { ...DEFAULT_STORE_FILTERS, query: 'GO' })).toEqual([go])
    expect(filterLanguageServers([go], { ...DEFAULT_STORE_FILTERS, query: 'python' })).toEqual([])
  })

  it('merges apps and language servers into one list, recommended first then by name', () => {
    const ls = (id: string, name: string) => ({
      id, name, description: 'x', targets: ['vide'], languages: [id], binary: id, args: [], versionArgs: [],
      install: { method: 'npm' as const, packages: [id] },
    })
    const zed = { ...docker, id: 'zed', name: 'Zed' }
    const dock = { ...docker, recommended: false }
    const items = mergeStoreItems([zed, dock], [ls('go', 'Go'), ls('ansible', 'Ansible')])
    expect(items.map((i) => (i.kind === 'app' ? i.app.name : i.server.name))).toEqual(['Zed', 'Ansible', 'Docker', 'Go'])
  })
})
