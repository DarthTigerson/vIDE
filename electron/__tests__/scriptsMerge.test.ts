import { describe, it, expect } from 'vitest'
import { mergeScriptsData } from '../scriptsMerge'
import type { Script } from '../scriptsData'

const s = (id: string, updatedAt: number, extra: Partial<Script> = {}): Script => ({
  id, title: id, description: '', body: '', shareOutput: true, createdAt: 0, updatedAt, ...extra,
})

describe('mergeScriptsData', () => {
  it('keeps items present on only one side', () => {
    const merged = mergeScriptsData({ scripts: [s('a', 1)] }, { scripts: [s('b', 1)] })
    expect(merged.scripts.map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('a newer tombstone beats an older edit', () => {
    const merged = mergeScriptsData({ scripts: [s('a', 1, { body: 'x' })] }, { scripts: [s('a', 2, { deletedAt: 2 })] })
    expect(merged.scripts[0].deletedAt).toBe(2)
  })

  it('a newer edit beats an older tombstone', () => {
    const merged = mergeScriptsData({ scripts: [s('a', 5, { body: 'kept' })] }, { scripts: [s('a', 2, { deletedAt: 2 })] })
    expect(merged.scripts[0].deletedAt).toBeUndefined()
    expect(merged.scripts[0].body).toBe('kept')
  })

  it('ties go to b', () => {
    const merged = mergeScriptsData({ scripts: [s('a', 1, { body: 'a' })] }, { scripts: [s('a', 1, { body: 'b' })] })
    expect(merged.scripts[0].body).toBe('b')
  })
})

describe('mergeScriptsData canonical order', () => {
  it('serializes identically whichever side merges (no commit ping-pong between machines)', () => {
    const x = s('x', 1, { createdAt: 5 })
    const y = s('y', 1, { createdAt: 3 })
    const ab = mergeScriptsData({ scripts: [x] }, { scripts: [y] })
    const ba = mergeScriptsData({ scripts: [y] }, { scripts: [x] })
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba))
    expect(ab.scripts.map((v) => v.id)).toEqual(['y', 'x'])
  })
})
