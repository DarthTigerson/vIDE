/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import type { FileNode } from '@/types/index'

const componentsChildren: FileNode[] = [
  { name: 'Button.tsx', path: '/proj/src/components/Button.tsx', isDirectory: false },
]
const srcChildren: FileNode[] = [
  { name: 'components', path: '/proj/src/components', isDirectory: true, children: componentsChildren },
  { name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false },
]
const rootTree: FileNode[] = [
  { name: 'src', path: '/proj/src', isDirectory: true, children: srcChildren },
  { name: 'README.md', path: '/proj/README.md', isDirectory: false },
]

function dataTransferFor(path: string) {
  return { getData: () => path, setData: vi.fn(), dropEffect: '' } as unknown as DataTransfer
}

let renamePath: ReturnType<typeof vi.fn>
let pathExists: ReturnType<typeof vi.fn>

beforeEach(() => {
  renamePath = vi.fn().mockResolvedValue(undefined)
  pathExists = vi.fn().mockResolvedValue(false)
  const readDir = vi.fn((dir: string) => {
    if (dir === '/proj') return Promise.resolve(rootTree)
    if (dir === '/proj/src') return Promise.resolve(srcChildren)
    if (dir === '/proj/src/components') return Promise.resolve(componentsChildren)
    return Promise.resolve([])
  })
  ;(global as any).window.api = { readDir, renamePath, pathExists, gitWatchRoot: vi.fn(), fsWatchRoot: vi.fn() }
  useFileStore.setState({
    projectRoot: '/proj',
    tree: rootTree,
    expandedPaths: new Set(['/proj/src', '/proj/src/components']),
    selectedPath: null,
    revealedPath: null,
  })
  useEditorStore.setState({ activeTabPath: null } as any)
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
})

afterEach(() => {
  cleanup()
})

describe('Sidebar — drag and drop', () => {
  it('moves a file into a folder it is dropped on', async () => {
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/README.md') })

    await waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith('/proj/README.md', '/proj/src/README.md')
    })
  })

  it('does not move a folder into itself', async () => {
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/src') })

    expect(renamePath).not.toHaveBeenCalled()
  })

  it('does not move a folder into its own descendant', async () => {
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src\\/components') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/src') })

    expect(renamePath).not.toHaveBeenCalled()
  })

  it('does not move an item onto the folder it is already in', async () => {
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/src/App.tsx') })

    expect(renamePath).not.toHaveBeenCalled()
  })

  it('skips the move when the destination name already exists', async () => {
    pathExists.mockResolvedValue(true)
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/README.md') })

    await waitFor(() => expect(pathExists).toHaveBeenCalled())
    expect(renamePath).not.toHaveBeenCalled()
  })

  it('moves an item to the project root when dropped on empty tree space', async () => {
    const { container } = render(<Sidebar />)
    const scrollArea = container.querySelector('.overflow-y-auto') as HTMLElement

    fireEvent.drop(scrollArea, { dataTransfer: dataTransferFor('/proj/src/App.tsx') })

    await waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith('/proj/src/App.tsx', '/proj/App.tsx')
    })
  })

  it('cannot drop onto a file (only directories are valid drop targets)', async () => {
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src\\/App\\.tsx') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/README.md') })

    expect(renamePath).not.toHaveBeenCalled()
  })
})

describe('Sidebar — undo a move', () => {
  it('shows an Undo toast after a successful move, and clicking it reverses the move', async () => {
    const { container } = render(<Sidebar />)
    const target = container.querySelector('#file-tree-node\\:\\/proj\\/src') as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/README.md') })
    await waitFor(() => expect(renamePath).toHaveBeenCalledWith('/proj/README.md', '/proj/src/README.md'))

    expect(screen.getByText('Undo')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Undo'))

    await waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith('/proj/src/README.md', '/proj/README.md')
    })
    expect(screen.queryByText('Undo')).not.toBeInTheDocument()
  })

  it('auto-dismisses the Undo toast after 10 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { container } = render(<Sidebar />)
      const target = container.querySelector('#file-tree-node\\:\\/proj\\/src') as HTMLElement

      fireEvent.drop(target, { dataTransfer: dataTransferFor('/proj/README.md') })
      await vi.waitFor(() => expect(renamePath).toHaveBeenCalledTimes(1))

      expect(screen.getByText('Undo')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(10000)
      expect(screen.queryByText('Undo')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
