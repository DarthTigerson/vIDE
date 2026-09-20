/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FileTree } from '../FileTree'
import { useFileStore } from '@/stores/fileStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import type { FileNode } from '@/types/index'

const nodes: FileNode[] = [
  { name: 'src', path: '/proj/src', isDirectory: true },
  { name: 'App.tsx', path: '/proj/App.tsx', isDirectory: false },
]

const noop = () => {}

function renderTree(onDropExternal = vi.fn(), onMoveNode = vi.fn()) {
  const utils = render(
    <FileTree
      nodes={nodes}
      directoryPath="/proj"
      onContextMenu={noop}
      prompt={null}
      setPromptValue={noop}
      commitPrompt={noop}
      cancelPrompt={noop}
      dragOverPath={null}
      setDragOverPath={noop}
      onMoveNode={onMoveNode}
      onDropExternal={onDropExternal}
    />
  )
  return { ...utils, onDropExternal, onMoveNode }
}

beforeEach(() => {
  useFileStore.setState({ projectRoot: '/proj', expandedPaths: new Set(), revealedPath: null, selectedPath: null })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
  ;(global as any).window.api = { readDir: vi.fn().mockResolvedValue([]), readFile: vi.fn(), gitWatchRoot: vi.fn(), fsWatchRoot: vi.fn() }
})
afterEach(() => cleanup())

describe('FileTree — external drops', () => {
  it('a Finder drop on a folder hands the files to onDropExternal with that folder', () => {
    const { container, onDropExternal, onMoveNode } = renderTree()
    const dir = container.querySelector('[id="file-tree-node:/proj/src"]') as HTMLElement
    const file = { name: 'x.txt' } as File
    fireEvent.drop(dir, { dataTransfer: { types: ['Files'], files: [file], getData: () => '' } })
    expect(onDropExternal).toHaveBeenCalledWith([file], '/proj/src')
    expect(onMoveNode).not.toHaveBeenCalled()
  })

  it('an internal drag still moves', () => {
    const { container, onDropExternal, onMoveNode } = renderTree()
    const dir = container.querySelector('[id="file-tree-node:/proj/src"]') as HTMLElement
    fireEvent.drop(dir, { dataTransfer: { types: ['text/plain'], files: [], getData: () => '/proj/App.tsx' } })
    expect(onMoveNode).toHaveBeenCalledWith('/proj/App.tsx', '/proj/src')
    expect(onDropExternal).not.toHaveBeenCalled()
  })

  it('a Finder drop on a file node does nothing', () => {
    const { container, onDropExternal } = renderTree()
    const fileNode = container.querySelector('[id="file-tree-node:/proj/App.tsx"]') as HTMLElement
    fireEvent.drop(fileNode, { dataTransfer: { types: ['Files'], files: [{} as File], getData: () => '' } })
    expect(onDropExternal).not.toHaveBeenCalled()
  })

  it('clicking a folder selects it', async () => {
    const { container } = renderTree()
    fireEvent.click(container.querySelector('[id="file-tree-node:/proj/src"]') as HTMLElement)
    await Promise.resolve()
    expect(useFileStore.getState().selectedPath).toBe('/proj/src')
  })
})
