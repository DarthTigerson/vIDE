import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FileTree } from '../FileTree'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { buildGitDiffPath, buildGitCommitDiffPath } from '@/components/Git/paths'
import type { FileNode } from '@/types/index'

const nodes: FileNode[] = [
  { name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false },
  { name: 'Other.tsx', path: '/proj/src/Other.tsx', isDirectory: false },
]

function noop() {}

beforeEach(() => {
  useFileStore.setState({ projectRoot: '/proj', expandedPaths: new Set(), revealedPath: null })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
  ;(global as any).window.api = { readFile: vi.fn().mockResolvedValue('file contents') }
})

afterEach(() => {
  cleanup()
})

function renderTree(activeTabPath: string | null) {
  useEditorStore.setState({ activeTabPath } as any)
  return render(
    <FileTree
      nodes={nodes}
      directoryPath="/proj/src"
      onContextMenu={noop}
      prompt={null}
      setPromptValue={noop}
      commitPrompt={noop}
      cancelPrompt={noop}
      dragOverPath={null}
      setDragOverPath={noop}
      onMoveNode={noop}
    />
  )
}

function classesFor(container: HTMLElement, path: string): string {
  return container.querySelector(`#file-tree-node\\:${CSS.escape(path)}`)?.getAttribute('class') ?? ''
}

describe('FileTree active-file highlight', () => {
  it('highlights the node for a plain open file tab', () => {
    const { container } = renderTree('/proj/src/App.tsx')
    expect(classesFor(container, '/proj/src/App.tsx')).toContain('bg-accent/20')
    expect(classesFor(container, '/proj/src/Other.tsx')).not.toContain('bg-accent/20')
  })

  it('highlights the node for a working-tree diff tab built from GitPanel\'s repo-relative git-status path', () => {
    // This mirrors GitPanel.tsx's actual call: buildGitDiffPath(file.path, staged),
    // where file.path comes straight from `git status --porcelain` and is
    // always repo-relative, never absolute.
    const { container } = renderTree(buildGitDiffPath('/proj', 'src/App.tsx', false))
    expect(classesFor(container, '/proj/src/App.tsx')).toContain('bg-accent/20')
    expect(classesFor(container, '/proj/src/Other.tsx')).not.toContain('bg-accent/20')
  })

  it('highlights the node for a staged working-tree diff tab the same way', () => {
    const { container } = renderTree(buildGitDiffPath('/proj', 'src/App.tsx', true))
    expect(classesFor(container, '/proj/src/App.tsx')).toContain('bg-accent/20')
  })

  it('highlights the node for a commit diff tab, built from a repo-relative git-show path', () => {
    const { container } = renderTree(buildGitCommitDiffPath('/proj', 'abc123', 'src/App.tsx'))
    expect(classesFor(container, '/proj/src/App.tsx')).toContain('bg-accent/20')
    expect(classesFor(container, '/proj/src/Other.tsx')).not.toContain('bg-accent/20')
  })

  it('highlights nothing when no tab is active', () => {
    const { container } = renderTree(null)
    expect(classesFor(container, '/proj/src/App.tsx')).not.toContain('bg-accent/20')
  })
})

describe('FileTree click on an already-highlighted diff node', () => {
  it('opens the plain file editor, not the diff, when clicking the node highlighted by an active commit diff tab', async () => {
    const { container } = renderTree(buildGitCommitDiffPath('/proj', 'abc123', 'src/App.tsx'))
    const node = container.querySelector('#file-tree-node\\:\\/proj\\/src\\/App\\.tsx') as HTMLElement

    fireEvent.click(node)
    await vi.waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith('/proj/src/App.tsx'))

    expect(useEditorStore.getState().activeTabPath).toBe('/proj/src/App.tsx')
  })

  it('opens the plain file editor, not the diff, when clicking the node highlighted by an active working-tree diff tab', async () => {
    const { container } = renderTree(buildGitDiffPath('/proj', 'src/App.tsx', false))
    const node = container.querySelector('#file-tree-node\\:\\/proj\\/src\\/App\\.tsx') as HTMLElement

    fireEvent.click(node)
    await vi.waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith('/proj/src/App.tsx'))

    expect(useEditorStore.getState().activeTabPath).toBe('/proj/src/App.tsx')
  })
})
