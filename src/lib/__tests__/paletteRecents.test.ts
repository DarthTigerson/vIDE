import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getRecents, recordRecent } from '../paletteRecents'

function stubStorage() {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
  stubStorage()
})

describe('paletteRecents', () => {
  it('starts empty', () => {
    expect(getRecents()).toEqual([])
  })

  it('records most recent first and de-duplicates', () => {
    recordRecent('a')
    recordRecent('b')
    recordRecent('a')
    expect(getRecents()).toEqual(['a', 'b'])
  })

  it('keeps at most 8', () => {
    for (let i = 0; i < 12; i++) recordRecent(`cmd-${i}`)
    const recents = getRecents()
    expect(recents).toHaveLength(8)
    expect(recents[0]).toBe('cmd-11')
  })

  it('never throws when storage is unavailable', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    expect(getRecents()).toEqual([])
    expect(() => recordRecent('a')).not.toThrow()
  })

  it('ignores corrupt stored data', () => {
    localStorage.setItem('vide:palette:recents', '{not json')
    expect(getRecents()).toEqual([])
  })
})
