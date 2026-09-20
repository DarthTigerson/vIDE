import { describe, it, expect } from 'vitest'
import { scoreQuery, rankBySearch, withRecentsFirst } from '../paletteSearch'

const items = [
  { id: 'pull', label: 'Git: Pull' },
  { id: 'push', label: 'Git: Push' },
  { id: 'publish', label: 'Git: Publish Branch' },
  { id: 'fetch', label: 'Git: Fetch' },
  { id: 'sg', label: 'Settings: Git' },
  { id: 'display', label: 'Settings: Display', description: 'Theme, panel style', keywords: ['colour'] },
  { id: 'editor', label: 'Settings: Editor' },
]

describe('rankBySearch', () => {
  it('returns the input untouched for an empty query', () => {
    expect(rankBySearch(items, '  ')).toBe(items)
  })

  it('"git pu" finds Pull, Push and Publish, and nothing else', () => {
    expect(rankBySearch(items, 'git pu').map((i) => i.id)).toEqual(['pull', 'push', 'publish'])
  })

  it('"set disp" finds only Settings: Display', () => {
    expect(rankBySearch(items, 'set disp').map((i) => i.id)).toEqual(['display'])
  })

  it('matches on description and keywords', () => {
    expect(rankBySearch(items, 'theme').map((i) => i.id)).toEqual(['display'])
    expect(rankBySearch(items, 'colour').map((i) => i.id)).toEqual(['display'])
  })

  it('matches an in-order subsequence of the label', () => {
    expect(rankBySearch(items, 'gpl').map((i) => i.id)).toContain('pull')
  })

  it('ranks a label prefix above a later word match', () => {
    const ranked = rankBySearch(items, 'git').map((i) => i.id)
    expect(ranked.indexOf('pull')).toBeLessThan(ranked.indexOf('sg'))
  })

  it('returns nothing when any token misses', () => {
    expect(rankBySearch(items, 'git zzz')).toEqual([])
  })
})

describe('scoreQuery', () => {
  it('is 0 when a token does not match', () => {
    expect(scoreQuery('zzz', items[0])).toBe(0)
  })
})

describe('withRecentsFirst', () => {
  it('floats recents to the top in recency order and keeps the rest in place', () => {
    const out = withRecentsFirst(items, ['editor', 'pull']).map((i) => i.id)
    expect(out.slice(0, 2)).toEqual(['editor', 'pull'])
    expect(out.slice(2)).toEqual(['push', 'publish', 'fetch', 'sg', 'display'])
  })

  it('ignores recent ids that are not in the list', () => {
    expect(withRecentsFirst(items, ['gone']).map((i) => i.id)).toEqual(items.map((i) => i.id))
  })
})
