import { describe, it, expect, beforeEach } from 'vitest'

const store: Record<string, string> = {}
;(global as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
}

import { getRecentColors, addRecentColor } from '../recentColors'

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k])
})

describe('recentColors', () => {
  it('starts empty', () => {
    expect(getRecentColors()).toEqual([])
  })

  it('adds a colour to the front', () => {
    addRecentColor('#ff0000')
    expect(getRecentColors()).toEqual(['#ff0000'])
  })

  it('most-recently-added colour is first', () => {
    addRecentColor('#ff0000')
    addRecentColor('#00ff00')
    expect(getRecentColors()).toEqual(['#00ff00', '#ff0000'])
  })

  it('re-adding an existing colour moves it to the front instead of duplicating', () => {
    addRecentColor('#ff0000')
    addRecentColor('#00ff00')
    addRecentColor('#ff0000')
    expect(getRecentColors()).toEqual(['#ff0000', '#00ff00'])
  })

  it('caps the list at 8 entries, dropping the oldest', () => {
    for (let i = 0; i < 10; i++) addRecentColor(`#00000${i}`)
    const recents = getRecentColors()
    expect(recents).toHaveLength(8)
    expect(recents[0]).toBe('#000009')
    expect(recents).not.toContain('#000000')
    expect(recents).not.toContain('#000001')
  })

  it('returns the updated list from addRecentColor itself', () => {
    const result = addRecentColor('#123456')
    expect(result).toEqual(getRecentColors())
  })

  it('persists across reads', () => {
    addRecentColor('#abcdef')
    expect(getRecentColors()).toEqual(['#abcdef'])
  })
})
