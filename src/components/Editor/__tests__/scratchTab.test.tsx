/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from '../TabBar'
import { useEditorStore } from '@/stores/editorStore'
import { buildScratchPath, isScratchTab } from '../paths'
import { useDiscardScratchStore } from '@/stores/discardScratchStore'

const SCRATCH = buildScratchPath('abc')
const REAL = '/project/src/a.ts'

function setup(scratchContent: string) {
  useEditorStore.setState({
    tabs: [
      { path: REAL, content: 'x', dirty: true },
      { path: SCRATCH, content: scratchContent, dirty: scratchContent !== '' },
    ],
    activeTabPath: SCRATCH,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': SCRATCH },
    paneTabLists: { 'pane-1': [REAL, SCRATCH] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
}

beforeEach(() => {
  setup('')
  useDiscardScratchStore.setState({ pending: null })
})
afterEach(() => cleanup())

describe('TabBar — scratch tabs', () => {
  it('labels a scratch tab "Untitled"', () => {
    render(<TabBar paneId="pane-1" />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('double-clicking the trailing gap opens a new scratch tab', () => {
    render(<TabBar paneId="pane-1" />)
    fireEvent.doubleClick(screen.getByText('Untitled').parentElement!.parentElement!)

    expect(useEditorStore.getState().tabs.filter((t) => isScratchTab(t.path))).toHaveLength(2)
  })

  // The gutter sits outside the scrolling list precisely so it survives tabs
  // overflowing the width, when the trailing gap above no longer exists.
  it('double-clicking the right gutter opens one even with no gap left', () => {
    render(<TabBar paneId="pane-1" />)
    fireEvent.doubleClick(screen.getByTitle('Double-click for a new file'))

    expect(useEditorStore.getState().tabs.filter((t) => isScratchTab(t.path))).toHaveLength(2)
  })

  it('double-clicking a tab itself does not open one', () => {
    render(<TabBar paneId="pane-1" />)
    fireEvent.doubleClick(screen.getByText('Untitled'))

    expect(useEditorStore.getState().tabs.filter((t) => isScratchTab(t.path))).toHaveLength(1)
  })

  it('closing an empty scratch tab needs no confirmation', () => {
    render(<TabBar paneId="pane-1" />)
    fireEvent.click(screen.getByLabelText('Close Untitled'))

    expect(useDiscardScratchStore.getState().pending).toBeNull()
    expect(useEditorStore.getState().tabs.some((t) => t.path === SCRATCH)).toBe(false)
  })

  // The modal itself is rendered once at the app root (DiscardScratchPromptHost)
  // so Cmd+W raises it too, so what TabBar is responsible for is raising the
  // request and NOT closing the tab behind it.
  it('closing a scratch tab with content raises the confirmation instead of closing', () => {
    setup('some work')
    render(<TabBar paneId="pane-1" />)
    fireEvent.click(screen.getByLabelText('Close Untitled'))

    expect(useDiscardScratchStore.getState().pending).toEqual({ kind: 'tab', paneId: 'pane-1', path: SCRATCH })
    expect(useEditorStore.getState().tabs.some((t) => t.path === SCRATCH)).toBe(true)
  })

  // A dirty tab backed by a real file still has its on-disk copy, so it keeps
  // the old close-immediately behaviour.
  it('does not confirm when closing a dirty tab backed by a real file', () => {
    setup('some work')
    render(<TabBar paneId="pane-1" />)
    fireEvent.click(screen.getByLabelText('Close a.ts'))

    expect(useDiscardScratchStore.getState().pending).toBeNull()
    expect(useEditorStore.getState().tabs.some((t) => t.path === REAL)).toBe(false)
  })
})

describe('editorStore — renameTabPath', () => {
  it('re-keys the tab in place across tabs, panes, active path and pins', () => {
    setup('saved me')
    useEditorStore.setState({ pinnedPaths: new Set([SCRATCH]) })
    useEditorStore.getState().renameTabPath(SCRATCH, '/project/notes.md')

    const s = useEditorStore.getState()
    expect(s.tabs.map((t) => t.path)).toEqual([REAL, '/project/notes.md'])
    expect(s.activeTabPath).toBe('/project/notes.md')
    expect(s.paneTabs['pane-1']).toBe('/project/notes.md')
    // Position within the pane is preserved — the whole reason this is a
    // rename rather than a close-and-reopen.
    expect(s.paneTabLists['pane-1']).toEqual([REAL, '/project/notes.md'])
    expect(s.pinnedPaths.has('/project/notes.md')).toBe(true)
    expect(s.pinnedPaths.has(SCRATCH)).toBe(false)
  })

  it('leaves the store alone for an unknown path', () => {
    setup('')
    const before = useEditorStore.getState().tabs
    useEditorStore.getState().renameTabPath('/nope', '/other')
    expect(useEditorStore.getState().tabs).toBe(before)
  })
})

describe('editorStore — renameTabPath collisions', () => {
  it('drops an already-open tab at the destination instead of duplicating the path', () => {
    setup('saved me')
    useEditorStore.getState().renameTabPath(SCRATCH, REAL)

    const s = useEditorStore.getState()
    expect(s.tabs.filter((t) => t.path === REAL)).toHaveLength(1)
    // The surviving tab is the scratch buffer's content, not the stale one.
    expect(s.tabs.find((t) => t.path === REAL)!.content).toBe('saved me')
    expect(s.paneTabLists['pane-1'].filter((p) => p === REAL)).toHaveLength(1)
  })

  it('opens a scratch tab in the pane that asked, not the active one', () => {
    setup('')
    useEditorStore.setState({
      activePaneId: 'pane-1',
      paneTabs: { 'pane-1': SCRATCH, 'pane-2': null },
      paneTabLists: { 'pane-1': [REAL, SCRATCH], 'pane-2': [] },
    })
    useEditorStore.getState().openScratchTab('pane-2')

    expect(useEditorStore.getState().paneTabLists['pane-2']).toHaveLength(1)
    expect(useEditorStore.getState().paneTabLists['pane-1']).toHaveLength(2)
  })
})
