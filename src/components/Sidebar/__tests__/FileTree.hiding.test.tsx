/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { FileTree } from '../FileTree'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useTreeHidingStore } from '@/stores/treeHidingStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { DEFAULT_HIDE_RULES, repoKey, type RepoHideRules } from '@/lib/treeHiding'
import type { FileNode } from '@/types/index'

const nodes: FileNode[] = [
  {
    name: 'src', path: '/proj/src', isDirectory: true, children: [
      { name: 'a.ts', path: '/proj/src/a.ts', isDirectory: false },
      { name: 'secret', path: '/proj/src/secret', isDirectory: true, children: [] },
    ],
  },
  { name: 'docs.ts', path: '/proj/docs.ts', isDirectory: true, children: [] },
  { name: 'notes.md', path: '/proj/notes.md', isDirectory: false },
  { name: 'secret', path: '/proj/secret', isDirectory: false },
  { name: '.env', path: '/proj/.env', isDirectory: false },
  { name: 'graphify-out', path: '/proj/graphify-out', isDirectory: true, children: [] },
  { name: 'dist', path: '/proj/dist', isDirectory: true, children: [] },
]

function noop() {}

function setRules(rules: Partial<RepoHideRules>) {
  useTreeHidingStore.setState({ byRepo: { [repoKey('/proj')]: { ...DEFAULT_HIDE_RULES, ...rules } } })
}

beforeEach(() => {
  useTreeHidingStore.setState({ byRepo: {} })
  useGraphifySettingsStore.setState({ enabled: false } as any)
  useFileStore.setState({ projectRoot: '/proj', expandedPaths: new Set(['/proj/src']), revealedPath: null })
  useEditorStore.setState({ activeTabPath: null } as any)
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: ['dist'] } } })
  ;(global as any).window.api = { readFile: vi.fn().mockResolvedValue('') }
})

afterEach(() => cleanup())

function renderTree(menuPath?: string | null) {
  return render(
    <FileTree
      nodes={nodes}
      directoryPath="/proj"
      onContextMenu={noop}
      menuPath={menuPath}
      prompt={null}
      setPromptValue={noop}
      commitPrompt={noop}
      cancelPrompt={noop}
      dragOverPath={null}
      setDragOverPath={noop}
      onMoveNode={noop}
      onDropExternal={noop}
    />
  )
}

const name = (text: string) => screen.queryByText(text, { selector: 'span' })
const row = (container: HTMLElement, path: string) =>
  container.querySelector(`[id="file-tree-node:${path}"]`) as HTMLElement | null

describe('FileTree hiding rules', () => {
  it('shows everything by default', () => {
    renderTree()
    for (const n of ['src', 'a.ts', 'notes.md', '.env', 'dist']) expect(name(n)).toBeInTheDocument()
  })

  it('a path rule hides that row and its children', () => {
    setRules({ paths: ['src'] })
    renderTree()
    expect(name('src')).toBeNull()
    expect(name('a.ts')).toBeNull()
    expect(name('notes.md')).toBeInTheDocument()
  })

  it('a name rule hides matching rows at any depth', () => {
    setRules({ names: ['secret'] })
    renderTree()
    expect(name('secret')).toBeNull()
    expect(name('a.ts')).toBeInTheDocument()
  })

  it('an extension rule hides matching files but not folders', () => {
    setRules({ extensions: ['ts'] })
    renderTree()
    expect(name('a.ts')).toBeNull()
    expect(name('docs.ts')).toBeInTheDocument()
    expect(name('notes.md')).toBeInTheDocument()
  })

  it('with showHidden, hidden rows render italic with a "hidden" tag', () => {
    setRules({ names: ['notes.md'], showHidden: true })
    const { container } = renderTree()
    const r = row(container, '/proj/notes.md')!
    expect(r).toHaveClass('italic')
    expect(r).toHaveClass('opacity-45')
    expect(r).toHaveTextContent('hidden')
    expect(row(container, '/proj/src')!).not.toHaveClass('italic')
    expect(row(container, '/proj/src')!).not.toHaveTextContent('hidden')
  })

  it('showGitignored false hides an ignored row', () => {
    setRules({ showGitignored: false })
    renderTree()
    expect(name('dist')).toBeNull()
    expect(name('notes.md')).toBeInTheDocument()
  })

  it('showDotfiles false hides .env', () => {
    setRules({ showDotfiles: false })
    renderTree()
    expect(name('.env')).toBeNull()
  })

  it('showGraphify false hides graphify-out only when graphify is enabled', () => {
    setRules({ showGraphify: false })
    const { unmount } = renderTree()
    expect(name('graphify-out')).toBeInTheDocument()
    unmount()
    useGraphifySettingsStore.setState({ enabled: true } as any)
    renderTree()
    expect(name('graphify-out')).toBeNull()
  })

  it('the menuPath row keeps a hover look', () => {
    const { container } = renderTree('/proj/notes.md')
    expect(row(container, '/proj/notes.md')).toHaveClass('bg-white/5')
    expect(row(container, '/proj/.env')).not.toHaveClass('bg-white/5')
  })
})
