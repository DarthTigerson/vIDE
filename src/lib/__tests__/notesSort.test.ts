import { describe, it, expect } from 'vitest'
import { sortNotes, placeName, renameInOrder } from '../notesSort'
import type { FileNode } from '@/types/index'

function note(name: string, createdMs: number, updatedMs: number): FileNode {
  return { name, path: `/n/${name}`, isDirectory: false, createdMs, updatedMs }
}
function folder(name: string, createdMs = 0, updatedMs = 0): FileNode {
  return { name, path: `/n/${name}`, isDirectory: true, createdMs, updatedMs }
}

const nodes = [
  note('0.1.21.md', 3, 10),
  folder('Work', 5, 1),
  note('0.1.3.md', 2, 30),
  folder('archive', 1, 9),
  note('0.1.2.md', 1, 20),
]
const names = (list: FileNode[]) => list.map((n) => n.name)

describe('sortNotes', () => {
  it('Alphabetical: folders first, case-insensitive, numbers by value', () => {
    expect(names(sortNotes(nodes, 'alphabetical'))).toEqual(['archive', 'Work', '0.1.2.md', '0.1.3.md', '0.1.21.md'])
  })

  it('Created: oldest first', () => {
    expect(names(sortNotes(nodes, 'created'))).toEqual(['archive', 'Work', '0.1.2.md', '0.1.3.md', '0.1.21.md'])
  })

  it('Updated: newest first', () => {
    expect(names(sortNotes(nodes, 'updated'))).toEqual(['archive', 'Work', '0.1.3.md', '0.1.2.md', '0.1.21.md'])
  })

  it('Manual: saved order, unplaced entries at the bottom alphabetically, stale names ignored', () => {
    expect(names(sortNotes(nodes, 'manual', ['Work', 'gone.md', '0.1.21.md']))).toEqual([
      'Work', 'archive', '0.1.21.md', '0.1.2.md', '0.1.3.md',
    ])
  })
})

describe('placeName', () => {
  it('moves an entry before or after another', () => {
    expect(placeName(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(placeName(['a', 'b', 'c'], 'a', 'b', 'after')).toEqual(['b', 'a', 'c'])
  })

  it('inserts an entry arriving from another folder', () => {
    expect(placeName(['a', 'b'], 'x', 'b', 'before')).toEqual(['a', 'x', 'b'])
  })
})

describe('renameInOrder', () => {
  it('keeps the position of an entry renamed in place', () => {
    expect(renameInOrder({ '': ['b.md', 'a.md'] }, 'a.md', 'z.md')).toEqual({ '': ['b.md', 'z.md'] })
  })

  it('drops a moved entry from its old folder', () => {
    expect(renameInOrder({ '': ['b.md', 'a.md'], Work: ['c.md'] }, 'a.md', 'Work/a.md')).toEqual({
      '': ['b.md'],
      Work: ['c.md'],
    })
  })

  it('carries a renamed folder\'s own and nested orders', () => {
    expect(renameInOrder({ '': ['Work'], Work: ['x.md'], 'Work/Sub': ['y.md'], Workshop: ['z.md'] }, 'Work', 'Jobs')).toEqual({
      '': ['Jobs'],
      Jobs: ['x.md'],
      'Jobs/Sub': ['y.md'],
      Workshop: ['z.md'],
    })
  })
})
