import { describe, it, expect, beforeEach } from 'vitest'
import { useDiscardScratchStore, requestCloseTab, requestCloseAllTabs } from '../discardScratchStore'
import { useEditorStore } from '../editorStore'
import { buildScratchPath } from '@/components/Editor/paths'

const SCRATCH = buildScratchPath('abc')
const REAL = '/project/a.ts'

function seed(scratchContent: string) {
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
  useDiscardScratchStore.setState({ pending: null })
}

beforeEach(() => seed(''))

describe('requestCloseTab', () => {
  it('raises a confirmation for a scratch tab with content, without closing it', () => {
    seed('unsaved work')
    requestCloseTab('pane-1', SCRATCH)

    expect(useDiscardScratchStore.getState().pending).toEqual({ kind: 'tab', paneId: 'pane-1', path: SCRATCH })
    expect(useEditorStore.getState().tabs.some((t) => t.path === SCRATCH)).toBe(true)
  })

  it('closes an empty scratch tab straight away', () => {
    requestCloseTab('pane-1', SCRATCH)

    expect(useDiscardScratchStore.getState().pending).toBeNull()
    expect(useEditorStore.getState().tabs.some((t) => t.path === SCRATCH)).toBe(false)
  })

  it('closes a dirty real file straight away — its on-disk copy survives', () => {
    seed('unsaved work')
    requestCloseTab('pane-1', REAL)

    expect(useDiscardScratchStore.getState().pending).toBeNull()
    expect(useEditorStore.getState().tabs.some((t) => t.path === REAL)).toBe(false)
  })
})

describe('requestCloseAllTabs', () => {
  it('prompts once with the count when unsaved buffers would be destroyed', () => {
    seed('unsaved work')
    requestCloseAllTabs()

    expect(useDiscardScratchStore.getState().pending).toEqual({ kind: 'all', count: 1 })
    expect(useEditorStore.getState().tabs).toHaveLength(2)
  })

  it('closes everything straight away when nothing would be lost', () => {
    requestCloseAllTabs()

    expect(useDiscardScratchStore.getState().pending).toBeNull()
    expect(useEditorStore.getState().tabs).toHaveLength(0)
  })
})
