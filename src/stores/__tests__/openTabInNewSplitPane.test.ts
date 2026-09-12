import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../editorStore'

describe('openTabInNewSplitPane', () => {
  beforeEach(() => useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
  }))

  it('"after" splits the new pane in on the right, leaving the original pane untouched', () => {
    useEditorStore.getState().openTab({ path: '/README.md', content: '# hi', dirty: false })
    useEditorStore.getState().openTabInNewSplitPane(
      { path: 'markdown-preview:///README.md', content: '', dirty: false },
      'pane-1',
      'horizontal',
      'after'
    )

    const state = useEditorStore.getState()
    expect(state.layout).toEqual({
      type: 'split',
      direction: 'horizontal',
      children: [
        { type: 'pane', id: 'pane-1' },
        { type: 'pane', id: state.activePaneId },
      ],
    })
    expect(state.paneTabLists['pane-1']).toEqual(['/README.md'])
    expect(state.paneTabLists[state.activePaneId]).toEqual(['markdown-preview:///README.md'])
    expect(state.activeTabPath).toBe('markdown-preview:///README.md')
    expect(state.tabs.map((t) => t.path)).toEqual(['/README.md', 'markdown-preview:///README.md'])
  })

  it('"before" splits the new pane in on the left, leaving the original pane untouched', () => {
    useEditorStore.getState().openTab({ path: 'markdown-preview:///README.md', content: '', dirty: false })
    useEditorStore.getState().openTabInNewSplitPane(
      { path: '/README.md', content: '# hi', dirty: false },
      'pane-1',
      'horizontal',
      'before'
    )

    const state = useEditorStore.getState()
    expect(state.layout).toEqual({
      type: 'split',
      direction: 'horizontal',
      children: [
        { type: 'pane', id: state.activePaneId },
        { type: 'pane', id: 'pane-1' },
      ],
    })
    expect(state.paneTabLists['pane-1']).toEqual(['markdown-preview:///README.md'])
    expect(state.paneTabLists[state.activePaneId]).toEqual(['/README.md'])
  })

  it('focuses the existing pane instead of duplicating when the tab is already open somewhere', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: '', dirty: false })
    useEditorStore.getState().openTabInNewSplitPane(
      { path: '/preview.md', content: '', dirty: false },
      'pane-1',
      'horizontal',
      'after'
    )
    const previewPaneId = useEditorStore.getState().activePaneId
    useEditorStore.getState().setActivePane('pane-1')

    useEditorStore.getState().openTabInNewSplitPane(
      { path: '/preview.md', content: '', dirty: false },
      'pane-1',
      'horizontal',
      'after'
    )

    const state = useEditorStore.getState()
    expect(state.activePaneId).toBe(previewPaneId)
    expect(Object.keys(state.paneTabLists)).toEqual(['pane-1', previewPaneId])
  })
})
