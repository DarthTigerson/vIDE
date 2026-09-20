import { describe, it, expect } from 'vitest'
import { findNodeByPath, isExternalFileDrag } from '../treeUtils'
import type { FileNode } from '@/types/index'

const tree: FileNode[] = [
  { name: 'src', path: '/p/src', isDirectory: true, children: [
    { name: 'a.ts', path: '/p/src/a.ts', isDirectory: false },
  ] },
  { name: 'README.md', path: '/p/README.md', isDirectory: false },
]

describe('findNodeByPath', () => {
  it('finds top-level and nested nodes', () => {
    expect(findNodeByPath(tree, '/p/README.md')?.name).toBe('README.md')
    expect(findNodeByPath(tree, '/p/src/a.ts')?.name).toBe('a.ts')
  })
  it('returns null when missing', () => {
    expect(findNodeByPath(tree, '/p/nope')).toBeNull()
  })
})

describe('isExternalFileDrag', () => {
  it('is true only when the drag carries Files', () => {
    expect(isExternalFileDrag({ types: ['Files'] } as unknown as DataTransfer)).toBe(true)
    expect(isExternalFileDrag({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false)
  })
  it('is false for a bare dataTransfer with no types, or none at all', () => {
    expect(isExternalFileDrag({} as DataTransfer)).toBe(false)
    expect(isExternalFileDrag(null)).toBe(false)
  })
})
