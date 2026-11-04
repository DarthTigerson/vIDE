import { describe, it, expect } from 'vitest'
import { truncateTabLabel, orderTabsForDisplay, isCompactTabStrip, COMPACT_TAB_WIDTH } from '../tabDisplay'

describe('truncateTabLabel', () => {
  it('leaves short names untouched', () => {
    expect(truncateTabLabel('App.tsx')).toBe('App.tsx')
  })

  it('leaves a name exactly at the limit untouched', () => {
    expect(truncateTabLabel('123456789012345')).toBe('123456789012345')
  })

  it('truncates a name over 15 characters and appends an ellipsis', () => {
    expect(truncateTabLabel('a-very-long-component-name.tsx')).toBe('a-very-long-com…')
    expect(truncateTabLabel('a-very-long-component-name.tsx').length).toBe(16) // 15 chars + ellipsis
  })
})

describe('orderTabsForDisplay', () => {
  it('leaves order untouched when nothing is pinned', () => {
    expect(orderTabsForDisplay(['/a.ts', '/b.ts', '/c.ts'], new Set())).toEqual(['/a.ts', '/b.ts', '/c.ts'])
  })

  it('moves pinned tabs to the front, preserving relative order within each group', () => {
    const pinned = new Set(['/b.ts', '/d.ts'])
    expect(orderTabsForDisplay(['/a.ts', '/b.ts', '/c.ts', '/d.ts'], pinned)).toEqual([
      '/b.ts', '/d.ts', '/a.ts', '/c.ts',
    ])
  })

  it('is a no-op when everything is pinned', () => {
    const pinned = new Set(['/a.ts', '/b.ts'])
    expect(orderTabsForDisplay(['/a.ts', '/b.ts'], pinned)).toEqual(['/a.ts', '/b.ts'])
  })
})

describe('isCompactTabStrip', () => {
  it('collapses once the average tab would be narrower than COMPACT_TAB_WIDTH', () => {
    expect(isCompactTabStrip(COMPACT_TAB_WIDTH * 10, 10)).toBe(false)
    expect(isCompactTabStrip(COMPACT_TAB_WIDTH * 10 - 1, 10)).toBe(true)
  })

  it('never collapses before the strip has been measured or with no tabs', () => {
    expect(isCompactTabStrip(0, 30)).toBe(false)
    expect(isCompactTabStrip(500, 0)).toBe(false)
  })
})
