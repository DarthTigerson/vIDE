import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../editorStore'
import { buildTodoBoardPath, buildTodoDetailPath } from '@/components/Settings/paths'

describe('closeTabsForProject', () => {
  beforeEach(() => useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
    pinnedPaths: new Set(),
  }))

  it('closes the board tab and detail tabs belonging to the deleted project', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: buildTodoBoardPath('p1'), content: '', dirty: false })
    store.openTab({ path: buildTodoDetailPath('p1', 'H-1'), content: '', dirty: false })

    store.closeTabsForProject('p1')

    expect(useEditorStore.getState().tabs).toHaveLength(0)
  })

  it('leaves tabs belonging to other projects and unrelated tabs open', () => {
    const store = useEditorStore.getState()
    store.openTab({ path: buildTodoBoardPath('p2'), content: '', dirty: false })
    store.openTab({ path: buildTodoDetailPath('p2', 'A-1'), content: '', dirty: false })
    store.openTab({ path: '/unrelated.ts', content: '', dirty: false })

    store.closeTabsForProject('p1')

    const paths = useEditorStore.getState().tabs.map((t) => t.path)
    expect(paths).toEqual([buildTodoBoardPath('p2'), buildTodoDetailPath('p2', 'A-1'), '/unrelated.ts'])
  })
})
