import { create } from 'zustand'
import type { Tab } from '@/types/index'
import {
  isTodoBoardTab,
  getTodoBoardProjectId,
  isTodoDetailTab,
  getTodoDetailIds,
} from '@/components/Settings/paths'
import { buildScratchPath } from '@/components/Editor/paths'
import { getBiggestPaneId } from '@/lib/paneLayout'
import { useGeneralSettingsStore } from './generalSettingsStore'

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

export function collectPaneIds(node: EditorLayoutNode): string[] {
  if (node.type === 'pane') return [node.id]
  return [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])]
}

// The window a newly opened tab lands in, per Settings > General > "Open new
// tabs in". Falls back to the active window when the biggest can't be measured
// (no DOM in tests) or isn't part of the current layout.
function paneForNewTab(state: { layout: EditorLayoutNode; activePaneId: string }): string {
  if (useGeneralSettingsStore.getState().newTabPane !== 'biggest') return state.activePaneId
  const biggest = getBiggestPaneId()
  return biggest && collectPaneIds(state.layout).includes(biggest) ? biggest : state.activePaneId
}

// Shared by closeAllTabs/closeSavedTabs: closes every open tab matching
// `shouldClose` (pinned tabs are always exempt, regardless of the
// predicate), collapsing any pane left with nothing open the same way
// closeTabInPane already does one tab at a time - just applied to however
// many panes empty out at once here.
function isTodoProjectTab(path: string, projectId: string): boolean {
  if (isTodoBoardTab(path)) return getTodoBoardProjectId(path) === projectId
  if (isTodoDetailTab(path)) return getTodoDetailIds(path).projectId === projectId
  return false
}

// detach: the tabs are leaving the editor rather than closing (the bottom
// terminal takes them), so pinned ones go too and none are recorded for
// Cmd+Shift+T.
function closeTabsMatching(
  state: EditorState,
  shouldClose: (tab: Tab) => boolean,
  { detach = false }: { detach?: boolean } = {}
): Partial<EditorState> {
  const pathsToClose = new Set(
    state.tabs.filter((t) => (detach || !state.pinnedPaths.has(t.path)) && shouldClose(t)).map((t) => t.path)
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

  const closedTabs = detach ? state.closedTabs : [
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

// Lets the bottom terminal claim terminal tabs as they open (true = claimed,
// the editor leaves it alone). A hook rather than an import so the two stores
// don't import each other.
let terminalTabRouter: ((tab: Tab) => boolean) | null = null
export function setTerminalTabRouter(router: ((tab: Tab) => boolean) | null): void {
  terminalTabRouter = router
}

// A tab coming back into the editor (restoreTabs): to `paneId` at `index`
// when that pane still exists, else wherever a new tab would open.
export interface RestoredTab {
  tab: Tab
  paneId: string | null
  index: number | null
}

export interface EditorSessionSnapshot {
  layout?: unknown
  paneTabs?: Record<string, string | null>
  paneTabLists?: Record<string, string[]>
  activePaneId?: string
}

function isLayoutNode(node: unknown): node is EditorLayoutNode {
  if (!node || typeof node !== 'object') return false
  const n = node as Record<string, unknown>
  if (n.type === 'pane') return typeof n.id === 'string'
  return n.type === 'split'
    && (n.direction === 'horizontal' || n.direction === 'vertical')
    && Array.isArray(n.children) && n.children.length === 2
    && isLayoutNode(n.children[0]) && isLayoutNode(n.children[1])
}

// Rebuilds a saved split layout and its tabs (lib/editorSession.ts). Only tabs
// with an entry in `contents` come back — the caller leaves out anything that
// can't be reopened (settings/git/terminal tabs, deleted files) — and a pane
// left with nothing collapses the way closing its last tab would. Null when
// there is nothing to restore.
export function restoredEditorState(
  saved: EditorSessionSnapshot,
  contents: Record<string, string>
): Pick<EditorState, 'tabs' | 'layout' | 'activePaneId' | 'activeTabPath' | 'paneTabs' | 'paneTabLists'> | null {
  if (!isLayoutNode(saved.layout)) return null
  let layout: EditorLayoutNode | null = saved.layout
  const seen = new Set<string>()
  const paneTabLists: Record<string, string[]> = {}
  const paneTabs: Record<string, string | null> = {}
  for (const paneId of collectPaneIds(saved.layout)) {
    const list = (saved.paneTabLists?.[paneId] ?? []).filter(
      (path) => typeof path === 'string' && path in contents && !seen.has(path)
    )
    list.forEach((path) => seen.add(path))
    if (list.length === 0) {
      layout = layout && removePane(layout, paneId)
      continue
    }
    const active = saved.paneTabs?.[paneId]
    paneTabLists[paneId] = list
    paneTabs[paneId] = active && list.includes(active) ? active : list[list.length - 1]
  }
  if (!layout) return null
  const paneIds = collectPaneIds(layout)
  const activePaneId = saved.activePaneId && paneIds.includes(saved.activePaneId) ? saved.activePaneId : paneIds[0]
  return {
    tabs: paneIds.flatMap((id) => paneTabLists[id]).map((path) => ({ path, content: contents[path], dirty: false })),
    layout,
    activePaneId,
    activeTabPath: paneTabs[activePaneId],
    paneTabs,
    paneTabLists,
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
  openScratchTab: (paneId?: string) => void
  openTabInPane: (tab: Tab, paneId: string) => void
  openTabAfter: (tab: Tab, afterPath: string) => void
  closeTabInPane: (paneId: string, path: string) => void
  closeTab: (path: string) => void
  closeTabEverywhere: (path: string) => void
  closeActiveTab: () => void
  closedTabs: { tab: Tab; paneId: string }[]
  pinnedPaths: Set<string>
  togglePin: (path: string) => void
  closeAllTabs: () => void
  // Every tab except keepPath (pinned tabs stay too), across all panes like closeAllTabs.
  closeOtherTabs: (keepPath: string) => void
  closeSavedTabs: () => void
  closeTabsForProject: (projectId: string) => void
  // Takes tabs out of the editor without closing them (pinned too, nothing
  // recorded for reopen); panes left empty collapse as on close.
  detachTabs: (paths: string[]) => void
  // Puts detached tabs back, in order, without the terminal router.
  restoreTabs: (entries: RestoredTab[]) => void
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
  openTabInNewSplitPane: (
    tab: Tab,
    paneId: string,
    direction: EditorSplitDirection,
    placement: SplitPlacement
  ) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string, content?: string) => void
  syncFromDisk: (path: string, content: string) => void
  setTabMissing: (path: string, missing: boolean) => void
  markTabsMissingForDeletedPath: (path: string) => void
  replaceTabPath: (oldPath: string, newPath: string) => void
  revealRequest: { path: string; line: number; col: number; searchTerm: string } | null
  setRevealRequest: (req: { path: string; line: number; col: number; searchTerm: string }) => void
  clearRevealRequest: () => void
  // Bumped by Cmd+R; the active EditorPane reloads its tab in response.
  reloadActiveRequest: number
  requestReloadActive: () => void
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
  reloadActiveRequest: 0,
  requestReloadActive: () => set((state) => ({ reloadActiveRequest: state.reloadActiveRequest + 1 })),

  openTab: (tab: Tab) => {
    get().openTabInPane(tab, paneForNewTab(get()))
  },

  // A new empty buffer with no file behind it. Each gets its own id so
  // several can be open at once — the path is the tab's identity in every
  // map below, so two scratch tabs sharing one path would be one tab.
  // paneId is for the tab bar that was double-clicked, which in a split is
  // not necessarily the active pane; Cmd+N passes nothing and follows
  // Settings > General > "Open new tabs in", like any other new tab.
  openScratchTab: (paneId?: string) => {
    const tab = { path: buildScratchPath(crypto.randomUUID()), content: '', dirty: false }
    get().openTabInPane(tab, paneId ?? paneForNewTab(get()))
  },

  // Like openTab, but lets the caller pick which pane a genuinely-new tab
  // lands in (e.g. "always open in biggest pane" for external launchers).
  // If the tab is already open somewhere, that pane wins regardless — same
  // as openTab, just factored out so both share this precedence rule.
  openTabInPane: (tab: Tab, paneId: string) => {
    if (terminalTabRouter?.(tab)) return
    const { tabs, paneTabLists, layout } = get()
    const paneIds = collectPaneIds(layout)
    // If the tab is already open in some pane, focus that pane rather than
    // also adding it to the target pane's list — otherwise the same tab ends
    // up open in two panes at once (e.g. reopening the Git Log tab from a
    // different pane than the one the user moved it to).
    const existingPaneId = paneIds.find((pid) => (paneTabLists[pid] ?? []).includes(tab.path))
    const targetPaneId = existingPaneId ?? paneId

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

    const currentList = paneTabLists[targetPaneId] ?? []
    set((state) => ({
      tabs: tabs.some((t) => t.path === tab.path) ? state.tabs : [...state.tabs, tab],
      activeTabPath: tab.path,
      activePaneId: targetPaneId,
      paneTabs: { ...state.paneTabs, [targetPaneId]: tab.path },
      paneTabLists: { ...state.paneTabLists, [targetPaneId]: [...currentList, tab.path] },
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

  // Re-keys a tab in place (a saved scratch buffer, a newly created Llama
  // model). Closing and reopening would drop the tab to the end of its pane's
  // list and lose which pane it was in; the path is the key in tabs, paneTabs,
  // paneTabLists, activeTabPath and pinnedPaths, so all of them move together.
  replaceTabPath: (oldPath, newPath) => {
    const before = get()
    if (oldPath === newPath || !before.tabs.some((t) => t.path === oldPath)) return
    // A tab already open at the destination would leave two tabs claiming one
    // path — duplicate React keys, and a close that removes the wrong one.
    // For a scratch Save As the file is about to be overwritten anyway (the
    // save dialog asked), so the stale tab showing its old contents goes.
    if (before.tabs.some((t) => t.path === newPath)) before.closeTabEverywhere(newPath)

    set((state) => ({
      tabs: state.tabs.map((t) => t.path === oldPath ? { ...t, path: newPath } : t),
      activeTabPath: state.activeTabPath === oldPath ? newPath : state.activeTabPath,
      paneTabs: Object.fromEntries(
        Object.entries(state.paneTabs).map(([id, p]) => [id, p === oldPath ? newPath : p])
      ),
      paneTabLists: Object.fromEntries(
        Object.entries(state.paneTabLists).map(([id, list]) => [id, list.map((p) => p === oldPath ? newPath : p)])
      ),
      pinnedPaths: new Set([...state.pinnedPaths].map((p) => p === oldPath ? newPath : p)),
    }))
  },

  closeActiveTab: () => {
    const { activePaneId, paneTabs, closeTabInPane } = get()
    const path = paneTabs[activePaneId]
    if (path) closeTabInPane(activePaneId, path)
  },

  closeAllTabs: () => set((state) => closeTabsMatching(state, () => true)),

  closeOtherTabs: (keepPath) => set((state) => closeTabsMatching(state, (tab) => tab.path !== keepPath)),

  closeSavedTabs: () => set((state) => closeTabsMatching(state, (tab) => !tab.dirty)),

  closeTabsForProject: (projectId) =>
    set((state) => closeTabsMatching(state, (tab) => isTodoProjectTab(tab.path, projectId))),

  detachTabs: (paths) => {
    const leaving = new Set(paths)
    set((state) => closeTabsMatching(state, (tab) => leaving.has(tab.path), { detach: true }))
  },

  restoreTabs: (entries) =>
    set((state) => {
      const paneIds = collectPaneIds(state.layout)
      const fallbackPaneId = paneForNewTab(state)
      const tabs = [...state.tabs]
      const paneTabLists = { ...state.paneTabLists }
      const paneTabs = { ...state.paneTabs }
      for (const { tab, paneId, index } of entries) {
        if (tabs.some((t) => t.path === tab.path)) continue
        const known = !!paneId && paneIds.includes(paneId)
        const targetPaneId = known ? paneId : fallbackPaneId
        const list = [...(paneTabLists[targetPaneId] ?? [])]
        list.splice(known && index !== null ? Math.min(index, list.length) : list.length, 0, tab.path)
        paneTabLists[targetPaneId] = list
        if (!paneTabs[targetPaneId]) paneTabs[targetPaneId] = tab.path
        tabs.push(tab)
      }
      return { tabs, paneTabLists, paneTabs, activeTabPath: paneTabs[state.activePaneId] ?? null }
    }),

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

  // Opens a genuinely-new tab into a freshly created pane split off from
  // `paneId`, leaving paneId's own tab list untouched — unlike
  // splitPaneForTab, which moves a tab already open in paneId out into the
  // new sibling. Backs the Markdown editor/preview toggle button, so code
  // and rendered preview can show side by side. If `tab.path` is already
  // open somewhere, focuses that pane instead of duplicating it, same as
  // openTabInPane's rule.
  openTabInNewSplitPane: (
    tab: Tab,
    paneId: string,
    direction: EditorSplitDirection,
    placement: SplitPlacement
  ) => {
    const { tabs, paneTabLists, layout, openTabInPane } = get()
    const paneIds = collectPaneIds(layout)
    const existingPaneId = paneIds.find((pid) => (paneTabLists[pid] ?? []).includes(tab.path))
    if (existingPaneId) {
      openTabInPane(tab, existingPaneId)
      return
    }

    set((state) => {
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
        tabs: state.tabs.some((t) => t.path === tab.path) ? state.tabs : [...state.tabs, tab],
        layout: replacePane(state.layout, paneId, replacement),
        activePaneId: nextPaneId,
        activeTabPath: tab.path,
        paneTabs: { ...state.paneTabs, [nextPaneId]: tab.path },
        paneTabLists: { ...state.paneTabLists, [nextPaneId]: [tab.path] },
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
