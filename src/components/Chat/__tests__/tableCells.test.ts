import { describe, it, expect } from 'vitest'
import { splitTableRow, cellRunsToEdge, tableCellContinues } from '../tableCells'

describe('splitTableRow', () => {
  it('splits a bordered content row into cells', () => {
    const cells = splitTableRow('│ Name │ Path  │')
    expect(cells?.map((c) => c.raw)).toEqual([' Name ', ' Path  '])
    expect(cells?.[0]).toMatchObject({ start: 1, end: 7 })
  })

  it('returns null for separator, border and plain rows', () => {
    expect(splitTableRow('├──────┼──────┤')).toBeNull()
    expect(splitTableRow('┌──────┬──────┐')).toBeNull()
    expect(splitTableRow('- /Users/a/b')).toBeNull()
    expect(splitTableRow('│')).toBeNull()
  })
})

describe('cellRunsToEdge', () => {
  it('is true only when the text fills the column', () => {
    const [full, gap, empty] = splitTableRow('│ /Users/x/lo │ /Users/x   │       │')!
    expect(cellRunsToEdge(full)).toBe(true)
    expect(cellRunsToEdge(gap)).toBe(false)
    expect(cellRunsToEdge(empty)).toBe(false)
  })
})

describe('tableCellContinues', () => {
  it('continues a filled cell into a non-empty cell below, per column', () => {
    const row = splitTableRow('│ id │ /Users/x/lo │')!
    const next = splitTableRow('│    │ ng/path.md  │')!
    expect(tableCellContinues(row, next, 1)).toBe(true)
    expect(tableCellContinues(row, next, 0)).toBe(false)
  })

  it('does not continue when the cell below is empty or the layout differs', () => {
    const row = splitTableRow('│ id │ /Users/x/lo │')!
    expect(tableCellContinues(row, splitTableRow('│ 2  │              │'), 1)).toBe(false)
    expect(tableCellContinues(row, splitTableRow('│ 2  │'), 1)).toBe(false)
    expect(tableCellContinues(row, null, 1)).toBe(false)
  })
})
