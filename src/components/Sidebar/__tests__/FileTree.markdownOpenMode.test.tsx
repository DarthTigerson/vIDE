import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FileTree } from '../FileTree'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { buildMarkdownPreviewPath } from '@/components/Viewer/paths'
import type { FileNode } from '@/types/index'

const nodes: FileNode[] = [
  { name: 'README.md', path: '/proj/README.md', isDirectory: false },
]

function noop() {}

beforeEach(() => {
  useFileStore.setState({ projectRoot: '/proj', expandedPaths: new Set(), revealedPath: null })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
  } as any)
  ;(global as any).window.api = { readFile: vi.fn().mockResolvedValue('# hi') }
})

afterEach(() => {
  cleanup()
  useEditorSettingsStore.getState().setMarkdownOpenMode('editor')
})

function renderTree() {
  return render(
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
      onMoveNode={noop}
    />
  )
}

function clickReadme(container: HTMLElement) {
  const node = container.querySelector('#file-tree-node\\:\\/proj\\/README\\.md') as HTMLElement
  fireEvent.click(node)
}

describe('FileTree — markdownOpenMode default click behavior', () => {
  it('"editor" (default) opens the plain file tab', async () => {
    const { container } = renderTree()
    clickReadme(container)
    await vi.waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith('/proj/README.md'))

    const state = useEditorStore.getState()
    expect(state.activeTabPath).toBe('/proj/README.md')
    expect(state.paneTabLists['pane-1']).toEqual(['/proj/README.md'])
  })

  it('"preview" opens the markdown-preview tab without reading file content up front', async () => {
    useEditorSettingsStore.getState().setMarkdownOpenMode('preview')
    const { container } = renderTree()
    clickReadme(container)

    await vi.waitFor(() => expect(useEditorStore.getState().activeTabPath).toBe(buildMarkdownPreviewPath('/proj/README.md')))
    expect(window.api.readFile).not.toHaveBeenCalled()
  })

  it('"split" opens the editor tab and a preview tab in a new pane to the right', async () => {
    useEditorSettingsStore.getState().setMarkdownOpenMode('split')
    const { container } = renderTree()
    clickReadme(container)

    await vi.waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith('/proj/README.md'))
    const state = useEditorStore.getState()
    expect(state.paneTabLists['pane-1']).toEqual(['/proj/README.md'])
    expect(state.layout).toEqual({
      type: 'split',
      direction: 'horizontal',
      children: [
        { type: 'pane', id: 'pane-1' },
        { type: 'pane', id: state.activePaneId },
      ],
    })
    expect(state.paneTabLists[state.activePaneId]).toEqual([buildMarkdownPreviewPath('/proj/README.md')])
  })
})
