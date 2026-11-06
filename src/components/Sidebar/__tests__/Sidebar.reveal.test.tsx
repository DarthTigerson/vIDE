import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import { useFileStore } from '@/stores/fileStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { buildGitDiffPath, buildGitCommitDiffPath } from '@/components/Git/paths'
import type { FileNode } from '@/types/index'

const rootTree: FileNode[] = [
  { name: 'src', path: '/proj/src', isDirectory: true },
]
const srcChildren: FileNode[] = [
  { name: 'components', path: '/proj/src/components', isDirectory: true },
]
const componentsChildren: FileNode[] = [
  { name: 'App.tsx', path: '/proj/src/components/App.tsx', isDirectory: false },
]

beforeEach(() => {
  ;(global as any).window.api = {
    readDir: vi.fn((dir: string) => {
      if (dir === '/proj/src') return Promise.resolve(srcChildren)
      if (dir === '/proj/src/components') return Promise.resolve(componentsChildren)
      return Promise.resolve([])
    }),
    gitWatchRoot: vi.fn(),
    fsWatchRoot: vi.fn(),
  }
  useFileStore.setState({
    projectRoot: '/proj',
    tree: rootTree,
    expandedPaths: new Set(),
    selectedPath: null,
    revealedPath: null,
  })
  useEditorStore.setState({ activeTabPath: null } as any)
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
  useSidebarUiStore.setState({ pendingCreate: null, revealRequest: null })
})

afterEach(() => {
  cleanup()
})

describe('Sidebar — Reveal in File Tree', () => {
  it('expands every ancestor directory and marks the target as revealed', async () => {
    render(<Sidebar />)

    act(() => { useSidebarUiStore.getState().requestReveal('/proj/src/components/App.tsx') })

    await waitFor(() => {
      expect(useFileStore.getState().expandedPaths.has('/proj/src')).toBe(true)
      expect(useFileStore.getState().expandedPaths.has('/proj/src/components')).toBe(true)
    })
    await waitFor(() => {
      expect(useFileStore.getState().revealedPath).toBe('/proj/src/components/App.tsx')
    })
  })

  it('clears the reveal request once consumed', async () => {
    render(<Sidebar />)

    act(() => { useSidebarUiStore.getState().requestReveal('/proj/src/components/App.tsx') })

    await waitFor(() => {
      expect(useSidebarUiStore.getState().revealRequest).toBeNull()
    })
  })

  it('renders the target node with an id the reveal effect can scroll to', async () => {
    const { container } = render(<Sidebar />)

    act(() => { useSidebarUiStore.getState().requestReveal('/proj/src/components/App.tsx') })

    await waitFor(() => {
      expect(container.querySelector('#file-tree-node\\:\\/proj\\/src\\/components\\/App\\.tsx')).toBeTruthy()
    })
  })

  it('ignores a reveal request for a path outside the current project root', async () => {
    render(<Sidebar />)

    act(() => { useSidebarUiStore.getState().requestReveal('/other-proj/App.tsx') })

    // Give any (incorrect) async expansion a tick to happen before asserting nothing changed.
    await new Promise((r) => setTimeout(r, 20))
    expect(useFileStore.getState().revealedPath).toBeNull()
    expect(useSidebarUiStore.getState().revealRequest).toEqual({ path: '/other-proj/App.tsx', expandTarget: undefined })
  })

  it('does not expand the target itself for a plain (file) reveal request', async () => {
    render(<Sidebar />)

    act(() => { useSidebarUiStore.getState().requestReveal('/proj/src/components/App.tsx') })

    await waitFor(() => {
      expect(useFileStore.getState().revealedPath).toBe('/proj/src/components/App.tsx')
    })
    expect(useFileStore.getState().expandedPaths.has('/proj/src/components/App.tsx')).toBe(false)
  })

  it('also expands the target directory itself when expandTarget is set — e.g. a repo root from the Git panel', async () => {
    render(<Sidebar />)

    act(() => { useSidebarUiStore.getState().requestReveal('/proj/src', true) })

    await waitFor(() => {
      expect(useFileStore.getState().expandedPaths.has('/proj/src')).toBe(true)
    })
    expect(window.api.readDir).toHaveBeenCalledWith('/proj/src')
  })
})

describe('Sidebar — auto-expand for the active diff tab', () => {
  // GitPanel.tsx builds working-tree diff tabs from git-status output,
  // which is always repo-relative — buildGitDiffPath here mirrors that
  // real call site rather than an absolute path, since that relative-path
  // case is exactly what was silently failing to expand before.

  it('expands ancestors for a working-tree diff tab already active when the Files panel mounts', async () => {
    useEditorStore.setState({ activeTabPath: buildGitDiffPath('/proj', 'src/components/App.tsx', false) } as any)
    render(<Sidebar />)

    await waitFor(() => {
      expect(useFileStore.getState().expandedPaths.has('/proj/src')).toBe(true)
      expect(useFileStore.getState().expandedPaths.has('/proj/src/components')).toBe(true)
    })
  })

  it('expands ancestors when switching to a commit diff tab while already mounted', async () => {
    render(<Sidebar />)

    act(() => {
      useEditorStore.setState({
        activeTabPath: buildGitCommitDiffPath('/proj', 'abc123', 'src/components/App.tsx'),
      } as any)
    })

    await waitFor(() => {
      expect(useFileStore.getState().expandedPaths.has('/proj/src/components')).toBe(true)
    })
  })

  it('expands ancestors for a plain file tab too, without touching revealedPath', async () => {
    useEditorStore.setState({ activeTabPath: '/proj/src/components/App.tsx' } as any)
    render(<Sidebar />)

    await waitFor(() => {
      expect(useFileStore.getState().expandedPaths.has('/proj/src/components')).toBe(true)
    })
    expect(useFileStore.getState().revealedPath).toBeNull()
  })

  it('scrolls the active file row into view (nearest, so a visible row does not jump)', async () => {
    const scrollIntoView = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView')
    render(<Sidebar />)

    act(() => {
      useEditorStore.setState({ activeTabPath: '/proj/src/components/App.tsx' } as any)
    })

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    })
  })
})
