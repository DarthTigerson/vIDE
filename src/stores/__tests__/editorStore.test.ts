import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../editorStore'

describe('editorStore', () => {
  beforeEach(() => useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
  }))

  it('starts empty', () => {
    expect(useEditorStore.getState().tabs).toHaveLength(0)
  })

  it('openTab adds a tab and sets it active', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: 'hello', dirty: false })
    const { tabs, activeTabPath } = useEditorStore.getState()
    expect(tabs).toHaveLength(1)
    expect(activeTabPath).toBe('/a.ts')
  })

  it('openTab on existing path activates without duplicating', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: 'hello', dirty: false })
    store.openTab({ path: '/b.ts', content: 'world', dirty: false })
    store.openTab({ path: '/a.ts', content: 'hello', dirty: false })
    expect(useEditorStore.getState().tabs).toHaveLength(2)
    expect(useEditorStore.getState().activeTabPath).toBe('/a.ts')
  })

  it('openTab focuses the pane already containing the tab, instead of adding it to the active pane too', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/git-log', content: '', dirty: false })
    store.splitActivePane('vertical')
    // splitActivePane moved the active tab ('/git-log') into a new pane, which is now active.
    const newPaneId = useEditorStore.getState().activePaneId
    expect(newPaneId).not.toBe('pane-1')

    // Simulate the user moving focus back to the original pane, then a git
    // action (e.g. a second push) re-opening the same tab from there.
    store.setActivePane('pane-1')
    store.openTab({ path: '/git-log', content: '', dirty: false })

    const state = useEditorStore.getState()
    expect(state.paneTabLists['pane-1']).toEqual(['/a.ts'])
    expect(state.paneTabLists[newPaneId]).toEqual(['/git-log'])
    expect(state.activePaneId).toBe(newPaneId)
    expect(state.activeTabPath).toBe('/git-log')
    expect(state.tabs.filter((t) => t.path === '/git-log')).toHaveLength(1)
  })

  it('closeTab removes the tab and activates the adjacent tab', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.openTab({ path: '/c.ts', content: '', dirty: false })
    store.setActive('/b.ts')
    store.closeTab('/b.ts')
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts', '/c.ts'])
    expect(useEditorStore.getState().activeTabPath).toBe('/c.ts')
  })

  it('closeActiveTab closes the active tab', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.closeActiveTab()
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts'])
    expect(useEditorStore.getState().activeTabPath).toBe('/a.ts')
  })

  it('closeTabEverywhere closes a tab that lives in a non-active pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/git-log', content: '', dirty: false })
    store.splitActivePane('vertical')
    // splitActivePane moved '/git-log' into a new (now active) pane.
    store.setActivePane('pane-1')
    expect(useEditorStore.getState().activePaneId).toBe('pane-1')

    store.closeTabEverywhere('/git-log')

    const state = useEditorStore.getState()
    expect(state.tabs.map((t) => t.path)).toEqual(['/a.ts'])
  })

  it('closeTabEverywhere is a no-op when the path is not open anywhere', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.closeTabEverywhere('/missing.ts')
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts'])
  })

  it('reopenLastClosed restores the most recently closed tab, including unsaved content', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: 'unsaved edit', dirty: true })
    store.closeTab('/b.ts')
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts'])

    store.reopenLastClosed()
    const { tabs, activeTabPath } = useEditorStore.getState()
    expect(tabs.map((t) => t.path)).toEqual(['/a.ts', '/b.ts'])
    expect(activeTabPath).toBe('/b.ts')
    expect(tabs.find((t) => t.path === '/b.ts')).toMatchObject({ content: 'unsaved edit', dirty: true })
  })

  it('reopenLastClosed does nothing when there is no closed-tab history', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.reopenLastClosed()
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts'])
  })

  it('reopenLastClosed pops closed tabs in LIFO order', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.closeTab('/a.ts')
    store.closeTab('/b.ts')

    store.reopenLastClosed()
    expect(useEditorStore.getState().activeTabPath).toBe('/b.ts')
    store.reopenLastClosed()
    expect(useEditorStore.getState().activeTabPath).toBe('/a.ts')
  })

  it('does not record a tab as closed when it stays open in another pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.setActive('/a.ts')
    store.splitActivePane('vertical')
    const newPaneId = useEditorStore.getState().activePaneId

    // Re-open /a.ts in pane-1 too, so it's now showing in both panes.
    store.setActivePane('pane-1')
    store.openTab({ path: '/a.ts', content: '', dirty: false })

    // Closing it in one pane shouldn't push it onto the closed-tabs stack
    // since it's still open in the other.
    store.closeTabInPane('pane-1', '/a.ts')
    expect(useEditorStore.getState().closedTabs).toHaveLength(0)

    store.closeTabInPane(newPaneId, '/a.ts')
    expect(useEditorStore.getState().closedTabs).toHaveLength(1)
  })

  it('moveTab reorders tabs in the active pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.openTab({ path: '/c.ts', content: '', dirty: false })
    store.moveTab('/c.ts', '/a.ts', 'before')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/c.ts', '/a.ts', '/b.ts'])
    store.moveTab('/c.ts', '/b.ts', 'after')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/a.ts', '/b.ts', '/c.ts'])
  })

  it('openTabAfter inserts the new tab right after the given path, not at the end', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.openTab({ path: '/c.ts', content: '', dirty: false })
    store.openTabAfter({ path: '/new.ts', content: '', dirty: false }, '/a.ts')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/a.ts', '/new.ts', '/b.ts', '/c.ts'])
    expect(useEditorStore.getState().activeTabPath).toBe('/new.ts')
  })

  it('openTabAfter targets the pane containing afterPath, even if it is not the active pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.splitActivePane('vertical')
    // splitActivePane moved the active tab ('/b.ts') into a new pane, which is now active.
    const newPaneId = useEditorStore.getState().activePaneId
    expect(newPaneId).not.toBe('pane-1')

    store.openTabAfter({ path: '/new.ts', content: '', dirty: false }, '/a.ts')
    const state = useEditorStore.getState()
    expect(state.paneTabLists['pane-1']).toEqual(['/a.ts', '/new.ts'])
    expect(state.paneTabLists[newPaneId]).toEqual(['/b.ts'])
    expect(state.activePaneId).toBe('pane-1')
    expect(state.activeTabPath).toBe('/new.ts')
  })

  it('setActive updates the active pane tab', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.setActive('/a.ts')
    expect(useEditorStore.getState().paneTabs['pane-1']).toBe('/a.ts')
  })

  it('splitActivePane moves the active tab into the new pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.splitActivePane('horizontal')
    const state = useEditorStore.getState()
    expect(state.layout.type).toBe('split')
    if (state.layout.type !== 'split') return
    expect(state.layout.direction).toBe('horizontal')
    expect(state.layout.children[0]).toEqual({ type: 'pane', id: 'pane-1' })
    expect(state.activePaneId).not.toBe('pane-1')
    // active tab moved to new pane; old pane gets the fallback
    expect(state.paneTabs['pane-1']).toBe('/a.ts')
    expect(state.paneTabs[state.activePaneId]).toBe('/b.ts')
    expect(state.paneTabLists['pane-1']).toEqual(['/a.ts'])
    expect(state.paneTabLists[state.activePaneId]).toEqual(['/b.ts'])
    expect(state.activeTabPath).toBe('/b.ts')
  })

  it('splitActivePane vertical moves the active tab into the new pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.splitActivePane('vertical')
    const state = useEditorStore.getState()
    expect(state.layout.type).toBe('split')
    if (state.layout.type !== 'split') return
    expect(state.layout.direction).toBe('vertical')
    expect(state.paneTabLists['pane-1']).toEqual(['/a.ts'])
    expect(state.paneTabLists[state.activePaneId]).toEqual(['/b.ts'])
  })

  it('splitActivePane does nothing when the active pane has fewer than two tabs', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.splitActivePane('horizontal')
    const state = useEditorStore.getState()
    expect(state.layout).toEqual({ type: 'pane', id: 'pane-1' })
    expect(state.activePaneId).toBe('pane-1')
  })

  it('closeTabInPane only removes from that pane, not from another pane showing the same tab', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.splitActivePane('horizontal')
    // pane-1 has [/a.ts], new pane has [/b.ts]
    // Manually put /b.ts into pane-1 too so both panes show it
    const newPaneId = useEditorStore.getState().activePaneId
    useEditorStore.setState((s) => ({
      paneTabLists: { ...s.paneTabLists, 'pane-1': ['/a.ts', '/b.ts'] },
      paneTabs: { ...s.paneTabs, 'pane-1': '/b.ts' },
    }))
    store.closeTabInPane('pane-1', '/b.ts')
    const state = useEditorStore.getState()
    // /b.ts removed from pane-1 but still exists globally (new pane still has it)
    expect(state.tabs.map((t) => t.path)).toContain('/b.ts')
    expect(state.paneTabLists['pane-1']).toEqual(['/a.ts'])
    expect(state.paneTabLists[newPaneId]).toEqual(['/b.ts'])
  })

  it('closeTabInPane collapses the pane when its last tab is closed', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.splitActivePane('horizontal')
    // active pane (new) has [/b.ts]; close it
    const newPaneId = useEditorStore.getState().activePaneId
    store.closeTabInPane(newPaneId, '/b.ts')
    const state = useEditorStore.getState()
    expect(state.layout).toEqual({ type: 'pane', id: 'pane-1' })
    expect(state.activePaneId).toBe('pane-1')
    expect(state.paneTabs).toEqual({ 'pane-1': '/a.ts' })
    expect(state.paneTabLists).toEqual({ 'pane-1': ['/a.ts'] })
  })

  it('closeTab last tab in single pane sets activeTabPath to null', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: '', dirty: false })
    useEditorStore.getState().closeTab('/a.ts')
    expect(useEditorStore.getState().tabs).toHaveLength(0)
    expect(useEditorStore.getState().activeTabPath).toBeNull()
  })

  it('moveTabBetweenPanes moves a tab and collapses source pane when empty', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    store.splitActivePane('horizontal')
    const newPaneId = useEditorStore.getState().activePaneId
    // pane-1: [/a.ts], newPane: [/b.ts]
    store.moveTabBetweenPanes(newPaneId, 'pane-1', '/b.ts')
    const state = useEditorStore.getState()
    // source pane (new) was empty after move → collapsed
    expect(state.layout).toEqual({ type: 'pane', id: 'pane-1' })
    expect(state.paneTabLists['pane-1']).toEqual(['/a.ts', '/b.ts'])
  })

  it('updateContent sets new content and marks dirty', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: 'original', dirty: false })
    useEditorStore.getState().updateContent('/a.ts', 'changed')
    const tab = useEditorStore.getState().tabs[0]
    expect(tab.content).toBe('changed')
    expect(tab.dirty).toBe(true)
  })

  it('markSaved clears dirty for a tab', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: 'original', dirty: false })
    useEditorStore.getState().updateContent('/a.ts', 'changed')
    useEditorStore.getState().setTabMissing('/a.ts', true)
    useEditorStore.getState().markSaved('/a.ts')
    expect(useEditorStore.getState().tabs[0].dirty).toBe(false)
    expect(useEditorStore.getState().tabs[0].missing).toBe(false)
  })

  it('markSaved keeps dirty when content changed after save started', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: 'original', dirty: false })
    useEditorStore.getState().updateContent('/a.ts', 'saved snapshot')
    useEditorStore.getState().updateContent('/a.ts', 'newer edit')
    useEditorStore.getState().markSaved('/a.ts', 'saved snapshot')
    expect(useEditorStore.getState().tabs[0].dirty).toBe(true)
  })

  it('syncFromDisk updates content for a clean tab', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: 'old', dirty: false })
    useEditorStore.getState().syncFromDisk('/a.ts', 'new from disk')
    const tab = useEditorStore.getState().tabs[0]
    expect(tab.content).toBe('new from disk')
    expect(tab.dirty).toBe(false)
  })

  it('syncFromDisk does not clobber a dirty tab', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: 'old', dirty: false })
    useEditorStore.getState().updateContent('/a.ts', 'unsaved user edit')
    useEditorStore.getState().syncFromDisk('/a.ts', 'new from disk')
    const tab = useEditorStore.getState().tabs[0]
    expect(tab.content).toBe('unsaved user edit')
    expect(tab.dirty).toBe(true)
  })

  it('setTabMissing marks a tab as missing', () => {
    useEditorStore.getState().openTab({ path: '/a.ts', content: '', dirty: false })
    useEditorStore.getState().setTabMissing('/a.ts', true)
    expect(useEditorStore.getState().tabs[0].missing).toBe(true)
  })

  it('markTabsMissingForDeletedPath marks matching file and directory tabs', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/proj/src/a.ts', content: '', dirty: false })
    store.openTab({ path: '/proj/src/b.ts', content: '', dirty: false })
    store.openTab({ path: '/proj/README.md', content: '', dirty: false })
    store.markTabsMissingForDeletedPath('/proj/src')
    expect(useEditorStore.getState().tabs.map((t) => t.missing ?? false)).toEqual([
      true,
      true,
      false,
    ])
  })

  it('setPaneActive sets activePaneId, activeTabPath, and paneTabs for the named pane', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    store.openTab({ path: '/b.ts', content: '', dirty: false })
    // Manually inject a second pane
    useEditorStore.setState({
      layout: {
        type: 'split',
        direction: 'horizontal',
        children: [
          { type: 'pane', id: 'pane-1' },
          { type: 'pane', id: 'pane-2' },
        ],
      },
      paneTabs: { 'pane-1': '/a.ts', 'pane-2': '/b.ts' },
      activePaneId: 'pane-1',
    })

    store.setPaneActive('pane-2', '/a.ts')

    const s = useEditorStore.getState()
    expect(s.activePaneId).toBe('pane-2')
    expect(s.activeTabPath).toBe('/a.ts')
    expect(s.paneTabs['pane-2']).toBe('/a.ts')
    expect(s.paneTabs['pane-1']).toBe('/a.ts') // untouched
  })

  it('setPaneActive is a no-op for a pane not in the layout', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: '/a.ts', content: '', dirty: false })
    const before = useEditorStore.getState()

    store.setPaneActive('pane-999', '/a.ts')

    const after = useEditorStore.getState()
    expect(after.activePaneId).toBe(before.activePaneId)
    expect(after.activeTabPath).toBe(before.activeTabPath)
  })
})
