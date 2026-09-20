/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen, act } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useFileClipboardStore } from '@/stores/fileClipboardStore'
import type { FileNode } from '@/types/index'

const srcChildren: FileNode[] = [{ name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false }]
const rootTree: FileNode[] = [
  { name: 'src', path: '/proj/src', isDirectory: true, children: srcChildren },
  { name: 'README.md', path: '/proj/README.md', isDirectory: false },
]

let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  useFileClipboardStore.getState().clear()
  api = {
    readDir: vi.fn(async (dir: string) => (dir === '/proj' ? rootTree : dir === '/proj/src' ? srcChildren : [])),
    writeClipboardFiles: vi.fn().mockResolvedValue(undefined),
    readClipboardFiles: vi.fn().mockResolvedValue(null),
    copyInto: vi.fn(async (src: string, dir: string) => `${dir}/${src.split('/').pop()}`),
    moveInto: vi.fn(async (src: string, dir: string) => `${dir}/${src.split('/').pop()}`),
    pathForFile: vi.fn((f: { path: string }) => f.path),
    renamePath: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(false),
    gitWatchRoot: vi.fn(),
    fsWatchRoot: vi.fn(),
  }
  ;(global as any).window.api = api
  useFileStore.setState({
    projectRoot: '/proj',
    tree: rootTree,
    expandedPaths: new Set(['/proj/src']),
    selectedPath: null,
    revealedPath: null,
  })
  useEditorStore.setState({ activeTabPath: null } as any)
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
})
afterEach(() => cleanup())

const nodeEl = (c: HTMLElement, path: string) =>
  c.querySelector(`[id="file-tree-node:${path}"]`) as HTMLElement

describe('Sidebar — clipboard', () => {
  it('Copy writes the OS clipboard', async () => {
    const { container } = render(<Sidebar />)
    fireEvent.contextMenu(nodeEl(container, '/proj/README.md'))
    fireEvent.click(screen.getByText('Copy'))
    await waitFor(() => expect(api.writeClipboardFiles).toHaveBeenCalledWith(['/proj/README.md'], 'copy'))
  })

  it('Cut writes the OS clipboard as cut', async () => {
    const { container } = render(<Sidebar />)
    fireEvent.contextMenu(nodeEl(container, '/proj/README.md'))
    fireEvent.click(screen.getByText('Cut'))
    await waitFor(() => expect(api.writeClipboardFiles).toHaveBeenCalledWith(['/proj/README.md'], 'cut'))
  })

  it('Paste is disabled when the clipboard has no files', async () => {
    const { container } = render(<Sidebar />)
    fireEvent.contextMenu(nodeEl(container, '/proj/src'))
    await waitFor(() => expect(api.readClipboardFiles).toHaveBeenCalled())
    expect(screen.getByText('Paste').closest('button')).toBeDisabled()
  })

  it('Paste on a folder pastes into that folder', async () => {
    api.readClipboardFiles.mockResolvedValue({ paths: ['/Users/x/a.txt'], mode: 'copy' })
    const { container } = render(<Sidebar />)
    fireEvent.contextMenu(nodeEl(container, '/proj/src'))
    await waitFor(() => expect(screen.getByText('Paste').closest('button')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Paste'))
    await waitFor(() => expect(api.copyInto).toHaveBeenCalledWith('/Users/x/a.txt', '/proj/src'))
  })

  it('Paste on a file pastes into its parent folder', async () => {
    api.readClipboardFiles.mockResolvedValue({ paths: ['/Users/x/a.txt'], mode: 'copy' })
    const { container } = render(<Sidebar />)
    fireEvent.contextMenu(nodeEl(container, '/proj/src/App.tsx'))
    await waitFor(() => expect(screen.getByText('Paste').closest('button')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Paste'))
    await waitFor(() => expect(api.copyInto).toHaveBeenCalledWith('/Users/x/a.txt', '/proj/src'))
  })

  it('Cmd+C then Cmd+V on a selected folder copies into it', async () => {
    api.readClipboardFiles.mockResolvedValue({ paths: ['/proj/README.md'], mode: 'copy' })
    const { container } = render(<Sidebar />)
    act(() => useFileStore.setState({ selectedPath: '/proj/README.md' }))
    fireEvent.keyDown(nodeEl(container, '/proj/README.md'), { key: 'c', metaKey: true })
    await waitFor(() => expect(api.writeClipboardFiles).toHaveBeenCalledWith(['/proj/README.md'], 'copy'))
    act(() => useFileStore.setState({ selectedPath: '/proj/src' }))
    fireEvent.keyDown(nodeEl(container, '/proj/src'), { key: 'v', metaKey: true })
    await waitFor(() => expect(api.copyInto).toHaveBeenCalledWith('/proj/README.md', '/proj/src'))
  })

  it('does not hijack Cmd+C/V typed into the rename input', async () => {
    const { container } = render(<Sidebar />)
    fireEvent.contextMenu(nodeEl(container, '/proj/README.md'))
    fireEvent.click(screen.getByText('Rename'))
    const input = container.querySelector('input') as HTMLInputElement
    api.readClipboardFiles.mockClear() // opening the menu already checked the clipboard for Paste
    fireEvent.keyDown(input, { key: 'v', metaKey: true })
    expect(api.readClipboardFiles).not.toHaveBeenCalled()
  })

  it('a Finder drop on a folder copies the dropped files into it', async () => {
    const { container } = render(<Sidebar />)
    const file = { path: '/Users/x/pic.png' } as unknown as File
    fireEvent.drop(nodeEl(container, '/proj/src'), { dataTransfer: { types: ['Files'], files: [file], getData: () => '' } })
    await waitFor(() => expect(api.copyInto).toHaveBeenCalledWith('/Users/x/pic.png', '/proj/src'))
  })

  it('a Finder drop on the empty tree area copies into the project root', async () => {
    const { container } = render(<Sidebar />)
    const file = { path: '/Users/x/pic.png' } as unknown as File
    const scroller = container.querySelector('ul')!.parentElement as HTMLElement
    fireEvent.drop(scroller, { dataTransfer: { types: ['Files'], files: [file], getData: () => '' } })
    await waitFor(() => expect(api.copyInto).toHaveBeenCalledWith('/Users/x/pic.png', '/proj'))
  })
})
