import { describe, it, expect } from 'vitest'
import { localDayIndex, shuffleFamilyFor } from '../themeShuffle'

const FAMILIES = ['claude', 'thomas', 'malta', 'luuk', 'borahae', 'link', 'atreus', 'gabriele']

describe('themeShuffle', () => {
  it('counts days in local time, changing at local midnight', () => {
    const late = localDayIndex(new Date(2026, 10, 17, 23, 59))
    const early = localDayIndex(new Date(2026, 10, 18, 0, 1))
    expect(early - late).toBe(1)
    expect(localDayIndex(new Date(2026, 10, 18, 0, 1))).toBe(localDayIndex(new Date(2026, 10, 18, 23, 0)))
  })

  it('is deterministic for a given day', () => {
    expect(shuffleFamilyFor(20_000, FAMILIES)).toBe(shuffleFamilyFor(20_000, FAMILIES))
  })

  it('never picks the same family two days running, across many cycles', () => {
    for (let day = 19_000; day < 22_000; day++) {
      expect(shuffleFamilyFor(day, FAMILIES)).not.toBe(shuffleFamilyFor(day - 1, FAMILIES))
    }
  })

  it('shows every family once per cycle', () => {
    const n = FAMILIES.length
    const start = Math.ceil(20_000 / n) * n
    const cycle = Array.from({ length: n }, (_, i) => shuffleFamilyFor(start + i, FAMILIES))
    expect(new Set(cycle).size).toBe(n)
  })
})
