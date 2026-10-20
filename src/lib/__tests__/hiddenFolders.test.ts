import { describe, it, expect } from 'vitest'
import { HIDDEN_FOLDER_PRESETS, filterHiddenNodes, gitignorePattern, isValidHiddenName } from '../hiddenFolders'
import type { FileNode } from '@/types/index'

const nodes: FileNode[] = [
  { name: '.git', path: '/p/.git', isDirectory: true },
  { name: 'src', path: '/p/src', isDirectory: true },
  { name: '.DS_Store', path: '/p/.DS_Store', isDirectory: false },
]

describe('filterHiddenNodes', () => {
  it('returns the same array when nothing is hidden', () => {
    expect(filterHiddenNodes(nodes, new Set())).toBe(nodes)
  })

  it('drops hidden names, files and folders alike', () => {
    expect(filterHiddenNodes(nodes, new Set(['.git', '.DS_Store'])).map((n) => n.name)).toEqual(['src'])
  })
})

describe('gitignorePattern', () => {
  it('adds a trailing slash for folders only', () => {
    expect(gitignorePattern('node_modules', true)).toBe('node_modules/')
    expect(gitignorePattern('.DS_Store', false)).toBe('.DS_Store')
  })
})

describe('isValidHiddenName', () => {
  it('accepts bare names', () => {
    expect(isValidHiddenName('.terraform')).toBe(true)
    expect(isValidHiddenName('target')).toBe(true)
  })

  it('rejects paths, patterns and dot entries', () => {
    for (const bad of ['', '.', '..', 'a/b', '*.log', 'a b', '!keep', '#x']) {
      expect(isValidHiddenName(bad)).toBe(false)
    }
  })
})

describe('HIDDEN_FOLDER_PRESETS', () => {
  it('has unique names', () => {
    const names = HIDDEN_FOLDER_PRESETS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('never offers to gitignore .git or committed tool config', () => {
    for (const name of ['.git', '.claude', '.cursor']) {
      expect(HIDDEN_FOLDER_PRESETS.find((p) => p.name === name)?.gitignore).toBe(false)
    }
  })
})
