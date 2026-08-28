import { create } from 'zustand'
import type { Tab } from '@/types/index'

export type EditorSplitDirection = 'horizontal' | 'vertical'
export type SplitPlacement = 'before' | 'after'

export type EditorLayoutNode =
  | { type: 'pane'; id: string }
  | { type: 'split'; direction: EditorSplitDirection; children: [EditorLayoutNode, EditorLayoutNode] }

const ROOT_PANE_ID = 'pane-1'

function createDefaultLayout(): EditorLayoutNode {
  return { type: 'pane', id: ROOT_PANE_ID }
}

function replacePane(
  node: EditorLayoutNode,
  paneId: string,
  replacement: EditorLayoutNode
): EditorLayoutNode {
  if (node.type === 'pane') return node.id === paneId ? replacement : node
  return {
    ...node,
    children: [
      replacePane(node.children[0], paneId, replacement),
      replacePane(node.children[1], paneId, replacement),
    ],
  }
}

function removePane(node: EditorLayoutNode, paneId: string): EditorLayoutNode | null {
  if (node.type === 'pane') return node.id === paneId ? null : node
  const left = removePane(node.children[0], paneId)
  const right = removePane(node.children[1], paneId)
  if (left === null) return right
  if (right === null) return left
  return { ...node, children: [left, right] }
}

function collectPaneIds(node: EditorLayoutNode): string[] {
  if (node.type === 'pane') return [node.id]
  return [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])]
}

// Shared by closeAllTabs/closeSavedTabs: closes every open tab matching
// `shouldClose` (pinned tabs are always exempt, regardless of the
// predicate), collapsing any pane left with nothing open the same way
// closeTabInPane already does one tab at a time - just applied to however
// many panes empty out at once here.
function closeTabsMatching(state: EditorState, shouldClose: (tab: Tab) => boolean): Partial<EditorState> {
  const pathsToClose = new Set(
    state.tabs.filter((t) => !state.pinnedPaths.has(t.path) && shouldClose(t)).map((t) => t.path)
  )
  if (pathsToClose.size === 0) return {}

  const allPaneIds = collectPaneIds(state.layout)
  const paneOfClosedPath = new Map<string, string>()
  for (const paneId of allPaneIds) {
    for (const path of state.paneTabLists[paneId] ?? []) {
      if (pathsToClose.has(path)) paneOfClosedPath.set(path, paneId)
    }
  }

  const newPaneTabLists: Record<string, string[]> = { ...state.paneTabLists }
  const newPaneTabs: Record<string, string | null> = { ...state.paneTabs }
  const emptiedPaneIds: string[] = []

  for (const paneId of allPaneIds) {
    const newList = (state.paneTabLists[paneId] ?? []).filter((p) => !pathsToClose.has(p))
    newPaneTabLists[paneId] = newList
    if (newList.length === 0) {
      emptiedPaneIds.push(paneId)
      continue
    }
    const oldActive = state.paneTabs[paneId]
    newPaneTabs[paneId] = oldActive && !pathsToClose.has(oldActive) ? oldActive : newList[newList.length - 1]
  }

  let newLayout: EditorLayoutNode | null = state.layout
  for (const paneId of emptiedPaneIds) {
    newLayout = removePane(newLayout as EditorLayoutNode, paneId)
    delete newPaneTabLists[paneId]
    delete newPaneTabs[paneId]
  }
  if (newLayout === null) {
    newLayout = createDefaultLayout()
    newPaneTabLists[ROOT_PANE_ID] = []
    newPaneTabs[ROOT_PANE_ID] = null
  }

  const survivingPaneIds = collectPaneIds(newLayout)
  const newActivePaneId = survivingPaneIds.includes(state.activePaneId)
    ? state.activePaneId
    : survivingPaneIds[0]
  const newActiveTabPath = newPaneTabs[newActivePaneId] ?? null

  const closedTabs = [
    ...state.closedTabs,
    ...state.tabs
      .filter((tab) => pathsToClose.has(tab.path))
      .map((tab) => ({ tab, paneId: paneOfClosedPath.get(tab.path) ?? state.activePaneId })),
  ].slice(-20)

  return {
    tabs: state.tabs.filter((t) => !pathsToClose.has(t.path)),
    layout: newLayout,
    activePaneId: newActivePaneId,
    activeTabPath: newActiveTabPath,
    paneTabs: newPaneTabs,
    paneTabLists: newPaneTabLists,
    closedTabs,
  }
}

export type PaneDirection = 'left' | 'right' | 'up' | 'down'

interface PaneAncestorStep {
  node: EditorLayoutNode & { type: 'split' }
  childIndex: 0 | 1
}

function findPathToPane(
  node: EditorLayoutNode,
  paneId: string,
  path: PaneAncestorStep[]
): PaneAncestorStep[] | null {
  if (node.type === 'pane') return node.id === paneId ? path : null
  return (
    findPathToPane(node.children[0], paneId, [...path, { node, childIndex: 0 }]) ??
    findPathToPane(node.children[1], paneId, [...path, { node, childIndex: 1 }])
  )
}

// A binary split tree has no notion of "the pane at the same vertical
// position" once you cross into a sibling subtree that's split again along
// the other axis - there's nothing to line up against. So when descending
// toward the shared boundary, splits along the requested direction's own
// axis pick the child nearest that boundary (the only unambiguous choice),
// and splits along the other axis just always take the first child - an
// arbitrary but deterministic and stable pick.
function pickBoundaryPane(node: EditorLayoutNode, direction: PaneDirection): string {
  if (node.type === 'pane') return node.id
  const onDirectionAxis =
    direction === 'left' || direction === 'right'
      ? node.direction === 'horizontal'
      : node.direction === 'vertical'
  if (!onDirectionAxis) return pickBoundaryPane(node.children[0], direction)
  const nearestChildIndex = direction === 'right' || direction === 'down' ? 0 : 1
  return pickBoundaryPane(node.children[nearestChildIndex], direction)
}

// Finds the pane, if any, spatially adjacent to `paneId` in `direction`,
// walking up the split tree to the nearest ancestor whose split axis
// matches the direction and whose other child is on that side.
export function findAdjacentPane(
  layout: EditorLayoutNode,
  paneId: string,
  direction: PaneDirection
): string | null {
  const path = findPathToPane(layout, paneId, [])
  if (!path) return null

  const directionAxis = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical'
  // The child index this pane's lineage must have come from for the OTHER
  // child to be in `direction`: e.g. for 'right', the sibling (children[1])
  // is to the right only if we descended via children[0].
  const cameFromIndex = direction === 'right' || direction === 'down' ? 0 : 1

  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i]
    if (step.node.direction !== directionAxis) continue
    if (step.childIndex !== cameFromIndex) continue
    const siblingIndex = step.childIndex === 0 ? 1 : 0
    return pickBoundaryPane(step.node.children[siblingIndex], direction)
  }
  return null
}

interface EditorState {
  tabs: Tab[]
  activeTabPath: string | null
  layout: EditorLayoutNode
  activePaneId: string
  paneTabs: Record<string, string | null>
  paneTabLists: Record<string, string[]>
  openTab: (tab: Tab) => void
  openTabAfter: (tab: Tab, afterPath: string) => void
  closeTabInPane: (paneId: string, path: string) => void
  closeTab: (path: string) => void
  closeTabEverywhere: (path: string) => void
  closeActiveTab: () => void
  closedTabs: { tab: Tab; paneId: string }[]
  pinnedPaths: Set<string>
  togglePin: (path: string) => void
  closeAllTabs: () => void
  closeSavedTabs: () => void
  reopenLastClosed: () => void
  resetForNewProject: () => void
  moveTabWithinPane: (paneId: string, path: string, targetPath: string, placement: 'before' | 'after') => void
  moveTab: (path: string, targetPath: string, placement: 'before' | 'after') => void
  moveTabBetweenPanes: (sourcePaneId: string, targetPaneId: string, path: string) => void
  moveTabToAdjacentPane: (paneId: string, path: string, direction: PaneDirection) => void
  setActive: (path: string) => void
  setActivePane: (paneId: string) => void
  setPaneActive: (paneId: string, path: string) => void
  splitActivePane: (direction: EditorSplitDirection) => void
  splitPaneForTab: (
    paneId: string,
    path: string,
    direction: EditorSplitDirection,
    placement: SplitPlacement
  ) => void
  splitPaneWithIncomingTab: (
    targetPaneId: string,
    sourcePaneId: string,
    path: string,
    direction: EditorSplitDirection,
    placement: SplitPlacement
  ) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string, content?: string) => void
  syncFromDisk: (path: string, content: string) => void
  setTabMissing: (path: string, missing: boolean) => void
  markTabsMissingForDeletedPath: (path: string) => void
  revealRequest: { path: string; line: number; col: number; searchTerm: string } | null
  setRevealRequest: (req: { path: string; line: number; col: number; searchTerm: string }) => void
  clearRevealRequest: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabPath: null,
  layout: createDefaultLayout(),
  activePaneId: ROOT_PANE_ID,
  paneTabs: { [ROOT_PANE_ID]: null },
  paneTabLists: { [ROOT_PANE_ID]: [] },
  closedTabs: [],
  pinnedPaths: new Set(),
  togglePin: (path: string) =>
    set((state) => {
      const pinnedPaths = new Set(state.pinnedPaths)
      if (pinnedPaths.has(path)) pinnedPaths.delete(path)
      else pinnedPaths.add(path)
      return { pinnedPaths }
    }),
  revealRequest: null,
  setRevealRequest: (req) => set({ revealRequest: req }),
  clearRevealRequest: () => set({ revealRequest: null }),

  openTab: (tab: Tab) => {
    const { tabs, activePaneId, paneTabLists, layout } = get()
    const paneIds = collectPaneIds(layout)
    // If the tab is already open in some pane, focus that pane rather than
    // also adding it to the active pane's list — otherwise the same tab ends
    // up open in two panes at once (e.g. reopening the Git Log tab from a
    // different pane than the one the user moved it to).
    const existingPaneId = paneIds.find((pid) => (paneTabLists[pid] ?? []).includes(tab.path))

    if (existingPaneId) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.path === tab.path ? { ...t, missing: tab.missing ?? false } : t
        ),
        activePaneId: existingPaneId,
        activeTabPath: tab.path,
        paneTabs: { ...state.paneTabs, [existingPaneId]: tab.path },
      }))
      return
    }

    const currentList = paneTabLists[activePaneId] ?? []
    set((state) => ({
      tabs: tabs.some((t) => t.path === tab.path) ? state.tabs : [...state.tabs, tab],
      activeTabPath: tab.path,
      paneTabs: { ...state.paneTabs, [activePaneId]: tab.path },
      paneTabLists: { ...state.paneTabLists, [activePaneId]: [...currentList, tab.path] },
    }))
  },

  // Like openTab, but inserts right after a given path within whichever pane
  // that path lives in — rather than at the end of the active pane's list —
  // and switches focus to it. Used for links that open into a new tab, so the
  // new tab lands next to the page that spawned it instead of at the far end
  // of the strip (or in an unrelated pane if the source pane isn't active).
  openTabAfter: (tab: Tab, afterPath: string) => {
    const state = get()
    const paneIds = collectPaneIds(state.layout)
    const paneId =
      paneIds.find((pid) => (state.paneTabLists[pid] ?? []).includes(afterPath)) ?? state.activePaneId
    const currentList = state.paneTabLists[paneId] ?? []
    const alreadyInPane = currentList.includes(tab.path)
    const alreadyOpen = state.tabs.some((t) => t.path === tab.path)

    let newList = currentList
    if (!alreadyInPane) {
      const afterIndex = currentList.indexOf(afterPath)
      const insertIndex = afterIndex === -1 ? currentList.length : afterIndex + 1
      newList = [...currentList.slice(0, insertIndex), tab.path, ...currentList.slice(insertIndex)]
    }

    set({
      tabs: alreadyOpen ? state.tabs : [...state.tabs, tab],
      activePaneId: paneId,
      activeTabPath: tab.path,
      paneTabs: { ...state.paneTabs, [paneId]: tab.path },
      paneTabLists: { ...state.paneTabLists, [paneId]: newList },
    })
  },

  closeTabInPane: (paneId: string, path: string) => {
    const state = get()
    const paneList = state.paneTabLists[paneId] ?? []
    const closedIndex = paneList.indexOf(path)
    if (closedIndex === -1) return

    const newPaneList = paneList.filter((p) => p !== path)
    const newPaneActive = state.paneTabs[paneId] === path
      ? (newPaneList[Math.min(closedIndex, newPaneList.length - 1)] ?? null)
      : state.paneTabs[paneId]

    const allPaneIds = collectPaneIds(state.layout)
    const stillInAnotherPane = allPaneIds.some(
      (pid) => pid !== paneId && (state.paneTabLists[pid] ?? []).includes(path)
    )
    const newTabs = stillInAnotherPane ? state.tabs : state.tabs.filter((t) => t.path !== path)

    // Only record it as "closed" (for Cmd+Shift+T) once it's no longer open
    // anywhere — removing it from just one pane while it stays open in
    // another isn't really closing it.
    const closedTab = state.tabs.find((t) => t.path === path)
    const closedTabs =
      !stillInAnotherPane && closedTab
        ? [...state.closedTabs, { tab: closedTab, paneId }].slice(-20)
        : state.closedTabs

    const otherPaneIds = allPaneIds.filter((pid) => pid !== paneId)
    const shouldCollapse = newPaneList.length === 0 && otherPaneIds.length > 0

    if (shouldCollapse) {
      const newLayout = removePane(state.layout, paneId) ?? createDefaultLayout()
      const newActivePaneId = otherPaneIds.includes(state.activePaneId)
        ? state.activePaneId
        : otherPaneIds[0]
      const newActiveTabPath = state.activePaneId === paneId
        ? (state.paneTabs[newActivePaneId] ?? null)
        : state.activeTabPath

      const newPaneTabs = { ...state.paneTabs }
      const newPaneTabLists = { ...state.paneTabLists }
      delete newPaneTabs[paneId]
      delete newPaneTabLists[paneId]

      set({
        tabs: newTabs,
        layout: newLayout,
        activePaneId: newActivePaneId,
        activeTabPath: newActiveTabPath,
        paneTabs: newPaneTabs,
        paneTabLists: newPaneTabLists,
        closedTabs,
      })
    } else {
      set({
        tabs: newTabs,
        activeTabPath: state.activePaneId === paneId ? newPaneActive : state.activeTabPath,
        paneTabs: { ...state.paneTabs, [paneId]: newPaneActive },
        paneTabLists: { ...state.paneTabLists, [paneId]: newPaneList },
        closedTabs,
      })
    }
  },

  closeTab: (path: string) => {
    const { activePaneId, closeTabInPane } = get()
    closeTabInPane(activePaneId, path)
  },

  // Unlike closeTab, doesn't assume the tab lives in the active pane —
  // for callers reacting to an event (e.g. archiving a todo) rather than a
  // direct user action on the focused tab strip.
  closeTabEverywhere: (path: string) => {
    const state = get()
    const paneId = collectPaneIds(state.layout).find((pid) =>
      (state.paneTabLists[pid] ?? []).includes(path)
    )
    if (paneId) state.closeTabInPane(paneId, path)
  },

  closeActiveTab: () => {
    const { activePaneId, paneTabs, closeTabInPane } = get()
    const path = paneTabs[activePaneId]
    if (path) closeTabInPane(activePaneId, path)
  },

  closeAllTabs: () => set((state) => closeTabsMatching(state, () => true)),

  closeSavedTabs: () => set((state) => closeTabsMatching(state, (tab) => !tab.dirty)),

  reopenLastClosed: () =>
    set((state) => {
      if (state.closedTabs.length === 0) return state
      const closedTabs = state.closedTabs.slice(0, -1)
      const { tab, paneId } = state.closedTabs[state.closedTabs.length - 1]

      const paneIds = collectPaneIds(state.layout)
      const targetPaneId = paneIds.includes(paneId) ? paneId : state.activePaneId

      const alreadyOpen = state.tabs.some((t) => t.path === tab.path)
      const currentList = state.paneTabLists[targetPaneId] ?? []
      const alreadyInPane = currentList.includes(tab.path)

      return {
        closedTabs,
        tabs: alreadyOpen ? state.tabs : [...state.tabs, tab],
        activePaneId: targetPaneId,
        activeTabPath: tab.path,
        paneTabs: { ...state.paneTabs, [targetPaneId]: tab.path },
        paneTabLists: alreadyInPane
          ? state.paneTabLists
          : { ...state.paneTabLists, [targetPaneId]: [...currentList, tab.path] },
      }
    }),

  // Switching to a different project root leaves every open tab (file,
  // terminal, browser) pointing at the old repo — close everything so the
  // window starts clean for the new one, the same way opening a fresh
  // window would. Unmounting TerminalTab/BrowserTab instances (which
  // happens once they're no longer in `tabs`) is what tears down their
  // underlying PTY/WebContentsView.
  resetForNewProject: () =>
    set({
      tabs: [],
      activeTabPath: null,
      layout: createDefaultLayout(),
      activePaneId: ROOT_PANE_ID,
      paneTabs: { [ROOT_PANE_ID]: null },
      paneTabLists: { [ROOT_PANE_ID]: [] },
      closedTabs: [],
      pinnedPaths: new Set(),
      revealRequest: null,
    }),

  moveTabWithinPane: (paneId: string, path: string, targetPath: string, placement: 'before' | 'after') =>
    set((state) => {
      if (path === targetPath) return state
      const paneList = state.paneTabLists[paneId] ?? []
      const withoutPath = paneList.filter((p) => p !== path)
      const targetIndex = withoutPath.indexOf(targetPath)
      if (targetIndex === -1) return state
      const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex
      const newList = [
        ...withoutPath.slice(0, insertIndex),
        path,
        ...withoutPath.slice(insertIndex),
      ]
      return { paneTabLists: { ...state.paneTabLists, [paneId]: newList } }
    }),

  moveTab: (path: string, targetPath: string, placement: 'before' | 'after') => {
    const { activePaneId, moveTabWithinPane } = get()
    moveTabWithinPane(activePaneId, path, targetPath, placement)
  },

  moveTabBetweenPanes: (sourcePaneId: string, targetPaneId: string, path: string) =>
    set((state) => {
      const sourceList = state.paneTabLists[sourcePaneId] ?? []
      const closedIndex = sourceList.indexOf(path)
      const newSourceList = sourceList.filter((p) => p !== path)
      const newSourceActive = state.paneTabs[sourcePaneId] === path
        ? (newSourceList[Math.min(closedIndex, newSourceList.length - 1)] ?? null)
        : state.paneTabs[sourcePaneId]
      const newTargetList = [...(state.paneTabLists[targetPaneId] ?? []), path]

      const allPaneIds = collectPaneIds(state.layout)
      const otherPaneIds = allPaneIds.filter((pid) => pid !== sourcePaneId)
      const shouldCollapseSource = newSourceList.length === 0 && otherPaneIds.length > 0

      if (shouldCollapseSource) {
        const newLayout = removePane(state.layout, sourcePaneId) ?? createDefaultLayout()
        const newActivePaneId = state.activePaneId === sourcePaneId ? targetPaneId : state.activePaneId
        const newPaneTabs = { ...state.paneTabs }
        const newPaneTabLists = { ...state.paneTabLists }
        delete newPaneTabs[sourcePaneId]
        delete newPaneTabLists[sourcePaneId]
        return {
          layout: newLayout,
          activePaneId: newActivePaneId,
          activeTabPath: path,
          paneTabs: { ...newPaneTabs, [targetPaneId]: path },
          paneTabLists: { ...newPaneTabLists, [targetPaneId]: newTargetList },
        }
      }

      return {
        activePaneId: targetPaneId,
        activeTabPath: path,
        paneTabs: { ...state.paneTabs, [sourcePaneId]: newSourceActive, [targetPaneId]: path },
        paneTabLists: { ...state.paneTabLists, [sourcePaneId]: newSourceList, [targetPaneId]: newTargetList },
      }
    }),

  moveTabToAdjacentPane: (paneId: string, path: string, direction: PaneDirection) => {
    const { layout, moveTabBetweenPanes } = get()
    const targetPaneId = findAdjacentPane(layout, paneId, direction)
    if (targetPaneId) moveTabBetweenPanes(paneId, targetPaneId, path)
  },

  setActive: (path: string) =>
    set((state) => ({
      activeTabPath: path,
      paneTabs: { ...state.paneTabs, [state.activePaneId]: path },
    })),

  setActivePane: (paneId: string) =>
    set((state) => {
      const paneIds = collectPaneIds(state.layout)
      if (!paneIds.includes(paneId)) return state
      const paneTabPath = state.paneTabs[paneId]
      return {
        activePaneId: paneId,
        activeTabPath: paneTabPath ?? state.activeTabPath,
      }
    }),

  setPaneActive: (paneId: string, path: string) =>
    set((state) => {
      const paneIds = collectPaneIds(state.layout)
      if (!paneIds.includes(paneId)) return state
      return {
        activePaneId: paneId,
        activeTabPath: path,
        paneTabs: { ...state.paneTabs, [paneId]: path },
      }
    }),

  splitActivePane: (direction: EditorSplitDirection) => {
    const { activePaneId, activeTabPath, splitPaneForTab } = get()
    if (!activeTabPath) return
    splitPaneForTab(activePaneId, activeTabPath, direction, 'after')
  },

  // Moves `path` out of `paneId` into a newly created sibling pane split off
  // in `direction`, positioned before (left/up) or after (right/down) the
  // original pane. No-ops if `path` isn't actually open in `paneId`, or if
  // it's the only tab there (splitting would leave the original pane empty,
  // which this codebase's panes never do - see closeTabInPane's collapse
  // logic for the other half of that invariant).
  splitPaneForTab: (
    paneId: string,
    path: string,
    direction: EditorSplitDirection,
    placement: SplitPlacement
  ) =>
    set((state) => {
      const currentPaneList = state.paneTabLists[paneId] ?? []
      if (currentPaneList.length < 2 || !currentPaneList.includes(path)) return state

      const pathIndex = currentPaneList.indexOf(path)
      const newCurrentList = currentPaneList.filter((p) => p !== path)
      const fallbackPath = newCurrentList[Math.min(pathIndex, newCurrentList.length - 1)] ?? null

      const nextPaneNumber = collectPaneIds(state.layout).length + 1
      const nextPaneId = `pane-${Date.now()}-${nextPaneNumber}`
      const originalPaneNode: EditorLayoutNode = { type: 'pane', id: paneId }
      const newPaneNode: EditorLayoutNode = { type: 'pane', id: nextPaneId }
      const replacement: EditorLayoutNode = {
        type: 'split',
        direction,
        children: placement === 'after' ? [originalPaneNode, newPaneNode] : [newPaneNode, originalPaneNode],
      }

      return {
        layout: replacePane(state.layout, paneId, replacement),
        activePaneId: nextPaneId,
        activeTabPath: path,
        paneTabs: {
          ...state.paneTabs,
          [paneId]: fallbackPath,
          [nextPaneId]: path,
        },
        paneTabLists: {
          ...state.paneTabLists,
          [paneId]: newCurrentList,
          [nextPaneId]: [path],
        },
      }
    }),

  // Backs the drop-zone overlay: dropping a dragged tab on the edge of a
  // pane's content area splits THAT pane in `direction`, landing the tab in
  // the new sibling - regardless of which pane (including this one) it was
  // dragged from. Same-pane drops just delegate to splitPaneForTab; cross-
  // pane drops leave the target pane's own tabs untouched and remove the
  // dragged tab from its source pane, collapsing that pane if it empties
  // out (the same invariant closeTabInPane/moveTabBetweenPanes enforce).
  splitPaneWithIncomingTab: (
    targetPaneId: string,
    sourcePaneId: string,
    path: string,
    direction: EditorSplitDirection,
    placement: SplitPlacement
  ) => {
    const { splitPaneForTab } = get()
    if (sourcePaneId === targetPaneId) {
      splitPaneForTab(targetPaneId, path, direction, placement)
      return
    }

    set((state) => {
      const sourceList = state.paneTabLists[sourcePaneId] ?? []
      if (!sourceList.includes(path)) return state

      const nextPaneNumber = collectPaneIds(state.layout).length + 1
      const nextPaneId = `pane-${Date.now()}-${nextPaneNumber}`
      const targetPaneNode: EditorLayoutNode = { type: 'pane', id: targetPaneId }
      const newPaneNode: EditorLayoutNode = { type: 'pane', id: nextPaneId }
      const replacement: EditorLayoutNode = {
        type: 'split',
        direction,
        children: placement === 'after' ? [targetPaneNode, newPaneNode] : [newPaneNode, targetPaneNode],
      }
      let newLayout = replacePane(state.layout, targetPaneId, replacement)

      const closedIndex = sourceList.indexOf(path)
      const newSourceList = sourceList.filter((p) => p !== path)
      const newPaneTabs = { ...state.paneTabs, [nextPaneId]: path }
      const newPaneTabLists = { ...state.paneTabLists, [nextPaneId]: [path] }

      if (newSourceList.length === 0) {
        newLayout = removePane(newLayout, sourcePaneId) ?? createDefaultLayout()
        delete newPaneTabs[sourcePaneId]
        delete newPaneTabLists[sourcePaneId]
      } else {
        newPaneTabs[sourcePaneId] =
          state.paneTabs[sourcePaneId] === path
            ? (newSourceList[Math.min(closedIndex, newSourceList.length - 1)] ?? null)
            : state.paneTabs[sourcePaneId]
        newPaneTabLists[sourcePaneId] = newSourceList
      }

      return {
        layout: newLayout,
        activePaneId: nextPaneId,
        activeTabPath: path,
        paneTabs: newPaneTabs,
        paneTabLists: newPaneTabLists,
      }
    })
  },

  updateContent: (path: string, content: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path ? { ...t, content, dirty: true } : t
      ),
    })),

  markSaved: (path: string, content?: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path && (content === undefined || t.content === content)
          ? { ...t, dirty: false, missing: false }
          : t
      ),
    })),

  // Pulls in a change made outside the app (an agent, another editor, a
  // terminal command) once the file watcher notices. Only applies to tabs
  // with no unsaved edits — checked here, not just by the caller, since the
  // user could start typing in the gap between the disk read and this call
  // resolving, and we must never clobber that with the on-disk version.
  syncFromDisk: (path: string, content: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path && !t.dirty && t.content !== content
          ? { ...t, content, dirty: false, missing: false }
          : t
      ),
    })),

  setTabMissing: (path: string, missing: boolean) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path ? { ...t, missing } : t
      ),
    })),

  markTabsMissingForDeletedPath: (path: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path || t.path.startsWith(`${path}/`)
          ? { ...t, missing: true }
          : t
      ),
    })),
}))
