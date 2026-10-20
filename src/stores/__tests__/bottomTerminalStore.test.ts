import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/paneLayout', () => ({ getBiggestPaneId: vi.fn(() => null) }))
vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged: vi.fn() }))

import { useEditorStore } from '../editorStore'
import { useBottomTerminalStore } from '../bottomTerminalStore'
import { useGeneralSettingsStore } from '../generalSettingsStore'

const tab = (path: string) => ({ path, content: '', dirty: false })
const term = (id: string) => `terminal://${id}`

function twoPanes(left: string[], right: string[]) {
  useEditorStore.setState({
    tabs: [...left, ...right].map(tab),
    activeTabPath: left[0] ?? null,
    layout: {
      type: 'split',
      direction: 'horizontal',
      children: [{ type: 'pane', id: 'pane-1' }, { type: 'pane', id: 'pane-2' }],
    } as never,
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': left[0] ?? null, 'pane-2': right[0] ?? null },
    paneTabLists: { 'pane-1': left, 'pane-2': right },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
}

beforeEach(() => {
  useBottomTerminalStore.getState().reset()
  useGeneralSettingsStore.setState({ newTabPane: 'active' })
  twoPanes([], [])
})

describe('switching the bottom terminal on', () => {
  it('moves every editor terminal tab down, in pane order, and leaves files alone', () => {
    twoPanes(['/a.ts', term('t1'), '/b.ts'], [term('t2'), '/c.ts'])
    useBottomTerminalStore.getState().setEnabled(true)

    const bottom = useBottomTerminalStore.getState()
    expect(bottom.sides).toEqual([['t1', 't2']])
    expect(bottom.origins).toEqual({ t1: { paneId: 'pane-1', index: 1 }, t2: { paneId: 'pane-2', index: 0 } })
    const editor = useEditorStore.getState()
    expect(editor.paneTabLists).toEqual({ 'pane-1': ['/a.ts', '/b.ts'], 'pane-2': ['/c.ts'] })
    expect(editor.tabs.map((t) => t.path)).toEqual(['/a.ts', '/b.ts', '/c.ts'])
    // Moving isn't closing: nothing to reopen with Cmd+Shift+T.
    expect(editor.closedTabs).toEqual([])
  })

  it('moves pinned terminals too, and collapses a pane left empty', () => {
    twoPanes(['/a.ts'], [term('t1')])
    useEditorStore.setState({ pinnedPaths: new Set([term('t1')]) })
    useBottomTerminalStore.getState().setEnabled(true)
    expect(useBottomTerminalStore.getState().sides).toEqual([['t1']])
    expect(useEditorStore.getState().layout).toEqual({ type: 'pane', id: 'pane-1' })
  })

  it('opens one fresh terminal when there was nothing to move', () => {
    twoPanes(['/a.ts'], [])
    useBottomTerminalStore.getState().setEnabled(true)
    const { sides, active } = useBottomTerminalStore.getState()
    expect(sides[0]).toHaveLength(1)
    expect(active[0]).toBe(sides[0][0])
  })

  it('sends new terminal tabs to the bottom instead of the editor', () => {
    twoPanes(['/a.ts'], [])
    useBottomTerminalStore.getState().setEnabled(true)
    useEditorStore.getState().openTab(tab(term('new')))
    expect(useBottomTerminalStore.getState().sides[0]).toContain('new')
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/a.ts'])
    // Files still open in the editor.
    useEditorStore.getState().openTab(tab('/z.ts'))
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/a.ts', '/z.ts'])
  })

  it('leaves terminal tabs in the editor while off', () => {
    useEditorStore.getState().openTab(tab(term('t1')))
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual([term('t1')])
    expect(useBottomTerminalStore.getState().has('t1')).toBe(false)
  })
})

describe('switching the bottom terminal off', () => {
  it('puts moved terminals back where they were', () => {
    twoPanes(['/a.ts', term('t1'), '/b.ts'], [term('t2'), '/c.ts'])
    useBottomTerminalStore.getState().setEnabled(true)
    useBottomTerminalStore.getState().setEnabled(false)

    expect(useEditorStore.getState().paneTabLists).toEqual({
      'pane-1': ['/a.ts', term('t1'), '/b.ts'],
      'pane-2': [term('t2'), '/c.ts'],
    })
    expect(useBottomTerminalStore.getState().sides).toEqual([[]])
    expect(useBottomTerminalStore.getState().enabled).toBe(false)
  })

  it('sends terminals born in the panel, or whose pane is gone, where new tabs open', () => {
    twoPanes(['/a.ts'], [term('t1')])
    useBottomTerminalStore.getState().setEnabled(true) // pane-2 collapses
    useBottomTerminalStore.getState().openTerminal('t2')
    useBottomTerminalStore.getState().setEnabled(false)
    expect(useEditorStore.getState().paneTabLists).toEqual({ 'pane-1': ['/a.ts', term('t1'), term('t2')] })
  })

  it('clamps a remembered position to the pane as it is now', () => {
    twoPanes(['/a.ts', '/b.ts', term('t1')], ['/c.ts'])
    useBottomTerminalStore.getState().setEnabled(true)
    useEditorStore.getState().closeTabInPane('pane-1', '/b.ts')
    useBottomTerminalStore.getState().setEnabled(false)
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/a.ts', term('t1')])
  })
})

describe('sides and tabs', () => {
  beforeEach(() => {
    twoPanes([term('a'), term('b')], ['/x.ts'])
    useBottomTerminalStore.getState().setEnabled(true)
  })

  it('splits into a right side with a fresh terminal, never more than two', () => {
    useBottomTerminalStore.getState().split()
    useBottomTerminalStore.getState().split()
    const { sides, focusedSide, active } = useBottomTerminalStore.getState()
    expect(sides).toHaveLength(2)
    expect(sides[1]).toHaveLength(1)
    expect(focusedSide).toBe(1)
    expect(active[1]).toBe(sides[1][0])
  })

  it('opens new terminals on the focused side', () => {
    useBottomTerminalStore.getState().split()
    useBottomTerminalStore.getState().openTerminal('c')
    expect(useBottomTerminalStore.getState().sides[1]).toContain('c')
    useBottomTerminalStore.getState().setFocusedSide(0)
    useBottomTerminalStore.getState().openTerminal('d')
    expect(useBottomTerminalStore.getState().sides[0]).toEqual(['a', 'b', 'd'])
  })

  it('moves a tab between sides and collapses the side it empties', () => {
    useBottomTerminalStore.getState().split()
    const right = useBottomTerminalStore.getState().sides[1][0]
    useBottomTerminalStore.getState().moveTerminal('a', 1, right)
    expect(useBottomTerminalStore.getState().sides).toEqual([['b'], ['a', right]])
    useBottomTerminalStore.getState().moveTerminal('b', 1, null)
    expect(useBottomTerminalStore.getState().sides).toEqual([['a', right, 'b']])
    expect(useBottomTerminalStore.getState().active).toEqual(['b'])
  })

  it('reorders within a side', () => {
    useBottomTerminalStore.getState().moveTerminal('b', 0, 'a')
    expect(useBottomTerminalStore.getState().sides).toEqual([['b', 'a']])
  })

  it('closing the right side’s last tab collapses the split', () => {
    useBottomTerminalStore.getState().split()
    const right = useBottomTerminalStore.getState().sides[1][0]
    useBottomTerminalStore.getState().closeTerminal(right)
    expect(useBottomTerminalStore.getState().sides).toEqual([['a', 'b']])
    expect(useBottomTerminalStore.getState().focusedSide).toBe(0)
  })

  it('closing a tab activates its neighbour, and the last one leaves an empty panel', () => {
    useBottomTerminalStore.getState().setActive(0, 'a')
    useBottomTerminalStore.getState().closeTerminal('a')
    expect(useBottomTerminalStore.getState().active).toEqual(['b'])
    useBottomTerminalStore.getState().closeTerminal('b')
    expect(useBottomTerminalStore.getState().sides).toEqual([[]])
    expect(useBottomTerminalStore.getState().enabled).toBe(true)
  })

  it('splits with a chosen tab to either side, but never empties the left', () => {
    useBottomTerminalStore.getState().splitWith('a', 'before')
    expect(useBottomTerminalStore.getState().sides).toEqual([['a'], ['b']])
    useBottomTerminalStore.getState().unsplit()
    useBottomTerminalStore.getState().closeTerminal('b')
    useBottomTerminalStore.getState().splitWith('a', 'after')
    expect(useBottomTerminalStore.getState().sides).toEqual([['a']])
  })

  it('closes others across both sides, or everything', () => {
    useBottomTerminalStore.getState().split()
    useBottomTerminalStore.getState().closeOthers('b')
    expect(useBottomTerminalStore.getState().sides).toEqual([['b']])
    useBottomTerminalStore.getState().closeAll()
    expect(useBottomTerminalStore.getState().sides).toEqual([[]])
    expect(useBottomTerminalStore.getState().enabled).toBe(true)
  })

  it('merges the right side into the left', () => {
    useBottomTerminalStore.getState().split()
    const right = useBottomTerminalStore.getState().sides[1][0]
    useBottomTerminalStore.getState().unsplit()
    expect(useBottomTerminalStore.getState().sides).toEqual([['a', 'b', right]])
  })
})

describe('restoring a project', () => {
  it('brings back a saved panel and sweeps in editor terminal tabs', () => {
    twoPanes(['/a.ts', term('old')], [])
    useBottomTerminalStore.getState().hydrate({
      enabled: true,
      sides: [['s1'], ['s2']],
      active: ['s1', 's2'],
      origins: { s1: { paneId: 'pane-2', index: 0 } },
      size: 40,
    })
    const state = useBottomTerminalStore.getState()
    expect(state.sides).toEqual([['s1', 'old'], ['s2']])
    expect(state.size).toBe(40)
    expect(state.origins.s1).toEqual({ paneId: 'pane-2', index: 0 })
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/a.ts'])
  })

  it('ignores a malformed or switched-off slice', () => {
    twoPanes([term('t1')], [])
    useBottomTerminalStore.getState().hydrate({ enabled: 'yes', sides: 'nope' })
    expect(useBottomTerminalStore.getState().enabled).toBe(false)
    useBottomTerminalStore.getState().hydrate({ enabled: false, sides: [['x']], active: [], origins: {}, size: 30 })
    expect(useBottomTerminalStore.getState().sides).toEqual([[]])
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual([term('t1')])
  })
})
