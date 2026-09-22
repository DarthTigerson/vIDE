/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TabContextMenu } from '../TabContextMenu'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { buildBrowserPath, buildTerminalPath } from '@/components/Settings/paths'
import { buildGitDiffPath, buildGitCommitDiffPath } from '@/components/Git/paths'
import { buildImagePreviewPath } from '@/components/Viewer/paths'
import { usePanelRequestStore } from '@/stores/panelRequestStore'

function resetStores() {
  useEditorStore.setState({
    tabs: [
      { path: '/a.ts', content: '', dirty: false },
      { path: '/b.ts', content: '', dirty: false },
    ],
    activeTabPath: '/a.ts',
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': '/a.ts' },
    paneTabLists: { 'pane-1': ['/a.ts', '/b.ts'] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
  useEditorSettingsStore.setState({ autoSaveEnabled: false })
  useBrowserStore.setState({ tabs: {} })
}

afterEach(() => {
  cleanup()
})

const defaultRequestClose = (path: string) =>
  useEditorStore.getState().closeTabInPane('pane-1', path)

describe('TabContextMenu — file tab', () => {
  it('shows the common actions and Copy File Path, not Reload/Duplicate', () => {
    resetStores()
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy File Path' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument()
  })

  it('shows Close All Saved when autosave is off, hides it when autosave is on', () => {
    resetStores()
    const { rerender } = render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Close All Saved' })).toBeInTheDocument()

    useEditorSettingsStore.setState({ autoSaveEnabled: true })
    rerender(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Close All Saved' })).not.toBeInTheDocument()
  })

  it('shows "Pin Tab" for an unpinned tab and "Unpin Tab" once pinned', () => {
    resetStores()
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pin Tab' })).toBeInTheDocument()

    useEditorStore.getState().togglePin('/a.ts')
    cleanup()
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Unpin Tab' })).toBeInTheDocument()
  })

  it('disables the Split trigger when the pane has only this one tab (nothing to leave behind)', () => {
    useEditorStore.setState({
      tabs: [{ path: '/a.ts', content: '', dirty: false }],
      activeTabPath: '/a.ts',
      layout: { type: 'pane', id: 'pane-1' },
      activePaneId: 'pane-1',
      paneTabs: { 'pane-1': '/a.ts' },
      paneTabLists: { 'pane-1': ['/a.ts'] },
      closedTabs: [],
      pinnedPaths: new Set(),
    })
    useEditorSettingsStore.setState({ autoSaveEnabled: false })
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Split' })).toBeDisabled()
  })

  it('hides Move entirely when the pane has no neighbors', () => {
    resetStores()
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('shows Move once a neighboring pane exists', () => {
    resetStores()
    useEditorStore.getState().splitPaneForTab('pane-1', '/b.ts', 'horizontal', 'after')
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument()
  })

  // Close is delegated to the caller rather than hitting the store directly,
  // so TabBar can put the unsaved-scratch confirmation in front of it.
  it('delegates Close to onRequestClose and dismisses the menu', () => {
    resetStores()
    const onClose = vi.fn()
    const onRequestClose = vi.fn()
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path="/a.ts" onRequestClose={onRequestClose} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onRequestClose).toHaveBeenCalledWith('/a.ts')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TabContextMenu — browser tab', () => {
  it('shows Reload and Duplicate, not Copy File Path', () => {
    resetStores()
    const browserPath = buildBrowserPath('browser-1')
    useEditorStore.setState({
      tabs: [{ path: browserPath, content: '', dirty: false }],
      activeTabPath: browserPath,
      paneTabs: { 'pane-1': browserPath },
      paneTabLists: { 'pane-1': [browserPath] },
    })
    useBrowserStore.getState().ensureTab('browser-1', 'https://example.com')

    render(<TabContextMenu x={10} y={10} paneId="pane-1" path={browserPath} onRequestClose={defaultRequestClose} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy File Path' })).not.toBeInTheDocument()
  })
})

describe('TabContextMenu — diff tabs', () => {
  const diffPath = buildGitDiffPath('/proj', 'src/a.ts', false)
  let pathExists: ReturnType<typeof vi.fn>
  let writeText: ReturnType<typeof vi.fn>

  function setup(path: string, exists = true) {
    resetStores()
    pathExists = vi.fn().mockResolvedValue(exists)
    writeText = vi.fn().mockResolvedValue(undefined)
    ;(global as any).window.api = { pathExists, readFile: vi.fn().mockResolvedValue('contents') }
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useEditorStore.setState({
      tabs: [{ path, content: '', dirty: false }],
      activeTabPath: path,
      paneTabs: { 'pane-1': path },
      paneTabLists: { 'pane-1': [path] },
    })
    usePanelRequestStore.setState({ request: null })
    render(<TabContextMenu x={10} y={10} paneId="pane-1" path={path} onRequestClose={defaultRequestClose} onClose={() => {}} />)
  }

  it('shows Open File for a working-tree diff whose file exists, and opens it in the tree', async () => {
    setup(diffPath)
    fireEvent.click(await screen.findByRole('button', { name: 'Open File' }))
    await waitFor(() => expect(useEditorStore.getState().activeTabPath).toBe('/proj/src/a.ts'))
    expect(usePanelRequestStore.getState().request?.panel).toBe('files')
    expect(pathExists).toHaveBeenCalledWith('/proj/src/a.ts')
  })

  it('shows Open File for a commit diff too', async () => {
    setup(buildGitCommitDiffPath('/proj', 'abc123', 'src/a.ts'))
    expect(await screen.findByRole('button', { name: 'Open File' })).toBeInTheDocument()
  })

  it('hides Open File when the file no longer exists', async () => {
    setup(diffPath, false)
    await waitFor(() => expect(pathExists).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Open File' })).not.toBeInTheDocument()
  })

  it('does not offer Open File on a plain file tab', () => {
    setup('/proj/src/a.ts')
    expect(screen.queryByRole('button', { name: 'Open File' })).not.toBeInTheDocument()
    expect(pathExists).not.toHaveBeenCalled()
  })

  it('Copy File Path copies the real file path, not the internal diff tab path', () => {
    setup(diffPath)
    fireEvent.click(screen.getByRole('button', { name: 'Copy File Path' }))
    expect(writeText).toHaveBeenCalledWith('/proj/src/a.ts')
  })

  it('Copy File Path unwraps an image preview tab', () => {
    setup(buildImagePreviewPath('/proj/logo.png'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy File Path' }))
    expect(writeText).toHaveBeenCalledWith('/proj/logo.png')
  })

  it('has no Copy File Path on a tab that is not a file', () => {
    setup(buildTerminalPath('t1'))
    expect(screen.queryByRole('button', { name: 'Copy File Path' })).not.toBeInTheDocument()
  })
})
