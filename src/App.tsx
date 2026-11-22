import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import * as monaco from 'monaco-editor'
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta, type PanelImperativeHandle } from 'react-resizable-panels'
import { SIDEBAR_PANEL, CHAT_PANEL, clampRem, remToPercent, percentToRem, percentLimits, loadRem } from '@/lib/remPanelSize'
import { openNewBrowserTab } from '@/lib/openBrowserTab'
import { syncOpenTabsFromDisk } from '@/lib/syncOpenTabsFromDisk'
import { refreshRepoStatuses } from '@/lib/refreshRepoStatuses'
import { restoreEditorSession, startEditorSessionPersistence } from '@/lib/editorSession'
import { resetBottomTerminal, restoreBottomTerminal, startBottomTerminalPersistence } from '@/lib/bottomTerminalSession'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { focusedBottomTerminalSide, focusedAgentTerminalSession, focusAfterTerminalClose } from '@/lib/bottomTerminalFocus'
import { liveTerminals } from '@/lib/liveTerminals'
import { BottomTerminal } from './components/Terminal/BottomTerminal'
import { formatMemory, memoryRows } from '@/lib/memoryBreakdown'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Editor } from './components/Editor/Editor'
import { ActionPalette } from './components/Search/ActionPalette'
import { SetupWizard } from './components/Onboarding/SetupWizard'
import { ShortcutsOverlay } from './components/Shortcuts/ShortcutsOverlay'
import { useHoldToShowShortcuts } from './components/Shortcuts/useHoldToShowShortcuts'
import { Chat } from './components/Chat/Chat'
import { openUrlInBrowserTab } from './components/Chat/terminalLinks'
import {
  ActivityBar,
  FilesIcon,
  SearchIcon,
  GitIcon,
  TodoIcon,
  PhoneIcon,
  GraphIcon,
  SettingsIcon,
  TerminalIcon,
  BrowserIcon,
  NewSessionPlusIcon,
  CompactIcon,
  ClearIcon,
  UsageIcon,
  CostIcon,
  UsageGraphIcon,
  NotesIcon,
  ScriptsIcon,
  LlamaIcon,
  AllAppsIcon,
  StoreIcon,
  APP_DRAG_MIME,
  hasBadge,
} from './components/ActivityBar/ActivityBar'
import type { ActivityBarItem } from './components/ActivityBar/ActivityBar'
import { BatteryPill } from './components/TitleBar/BatteryPill'
import { AllAppsPanel, type AllAppsEntry, type DisabledAppEntry } from './components/AllApps/AllAppsPanel'
import { useAppContribStore } from './apps/appContribStore'
import { buildStoreAppEntries, buildStoreDisabledEntries, buildStoreAppBarItems, storeAppPanelLeavesOnProjectClose, panelForRequest, storeEntriesHaveBadge } from './apps/storeAppItems'
import { StoreAppPanel } from './apps/StoreAppPanel'
import { useAppFavoritesStore } from './stores/appFavoritesStore'
import { APPEND_TARGET, MOVABLE_APP_IDS, isMovableAppId, pickTemporaryApp, splitApps, type MovableAppId } from './lib/appFavorites'
import { APP_SETTINGS_PATHS, appEnabledSetter } from './lib/appSettings'
import { SessionIcon } from './components/ActivityBar/SessionIcon'
import { NewSessionMenu } from './components/ActivityBar/NewSessionMenu'
import { ClaudeSessionContextMenu } from './components/ActivityBar/ClaudeSessionContextMenu'
import { sessionDisplayName, terminalSessionTitle } from './lib/claudeSessionName'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { GitPanel } from './components/Git/GitPanel'
import { BranchPalette } from './components/Git/BranchPalette'
import { GitPromptHost } from './components/Git/GitPromptHost'
import { StoreHost } from './components/Store/StoreHost'
import { MobileDisplayPanel } from './components/MobileDisplay/MobileDisplayPanel'
import { GraphifyPanel } from './components/Graphify/GraphifyPanel'
import { StatusBar } from './components/StatusBar/StatusBar'
import { EasterEgg } from './components/EasterEgg'
import { CommandPalette } from './components/Search/CommandPalette'
import { RecentProjectsPalette } from './components/Search/RecentProjectsPalette'
import { SearchPanel } from './components/Search/SearchPanel'
import { useFileStore } from './stores/fileStore'
import { useGeneralSettingsStore } from './stores/generalSettingsStore'
import { useClaudeStore, selectActiveSession } from './stores/claudeStore'
import { useBridgeStore } from './stores/bridgeStore'
import { useBridgeSettingsStore } from './stores/bridgeSettingsStore'
import { useModelSettingsStore } from './stores/modelSettingsStore'
import { useGitStore, useRepoGitState } from './stores/gitStore'
import { useTodoStore } from './stores/todoStore'
import { useGitReposStore, useActiveRepo } from './stores/gitReposStore'
import { useGitSettingsStore } from './stores/gitSettingsStore'
import { useMobileStore } from './stores/mobileStore'
import { useMobileSettingsStore } from './stores/mobileSettingsStore'
import { useThemeStore } from './stores/themeStore'
import type { ThemeId } from './stores/themeStore'
import { useDisplayStore } from './stores/displayStore'
import { backgroundImageStyle } from './assets/emptyEditorBackgrounds'
import { useEditorStore } from './stores/editorStore'
import { useSearchStore } from './stores/searchStore'
import { useGlobalSearchStore } from './stores/globalSearchStore'
import { useEditorFindStore } from './stores/editorFindStore'
import { useFontSizeStore } from './stores/fontSizeStore'
import { useInstanceFontSizeStore } from './stores/instanceFontSizeStore'
import { useSidebarUiStore } from './stores/sidebarUiStore'
import { useUpdateStore } from './stores/updateStore'
import { useUsageAlertStore } from './stores/usageAlertStore'
import { useChangelogStore } from './stores/changelogStore'
import { useOnboardingStore } from './stores/onboardingStore'
import { useBrowserStore } from './stores/browserStore'
import { useBrowserSettingsStore } from './stores/browserSettingsStore'
import { useGitPanelOpenAlertStore } from './stores/gitPanelOpenAlertStore'
import { useTodoSettingsStore } from './stores/todoSettingsStore'
import { useNotesSettingsStore } from './stores/notesSettingsStore'
import { useLlamaSettingsStore } from './stores/llamaSettingsStore'
import { useLlamaModelsStore } from './stores/llamaModelsStore'
import { useLlamaStore } from './stores/llamaStore'
import { availableAgents, agentLabel, isClaudeLike, isLlamaKind, isTerminalKind, llamaModelId } from './lib/agentKinds'
import { useRunningLlamaCount } from './hooks/useRunningLlamaCount'
import { useLlamaAvailability } from './hooks/useLlamaAvailability'
import { AutocompleteLifecycle } from './hooks/useAutocompleteLifecycle'
import { usePanelRequests } from './hooks/usePanelRequests'
import { useGraphifySettingsStore } from './stores/graphifySettingsStore'
import { useGraphifyAutoBuild } from './hooks/useGraphifyAutoBuild'
import { useGraphifyHookRepair } from './hooks/useGraphifyHookRepair'
import { useGraphifyPromptChecks } from './hooks/useGraphifyPromptChecks'
import { useNotesStore } from './stores/notesStore'
import { evaluateCmdWForPinnedTab, type PendingClose } from './lib/pinnedTabCloseGuard'
import { countUnsaved, type UnsavedState } from './lib/unsavedState'
import type { Tab } from './types/index'
import { useDiscardScratchStore, requestCloseTab } from './stores/discardScratchStore'
import { ConfirmDiscardScratchModal } from './components/Editor/ConfirmDiscardScratchModal'
import { buildTerminalPath, buildBrowserPath, buildAppSettingsPath, STORE_TAB_PATH, USAGE_GRAPH_TAB_PATH } from './components/Settings/paths'
import { TodoPanel } from './components/Todo/TodoPanel'
import { NotesPanel } from './components/Notes/NotesPanel'
import { ScriptsPanel } from './components/Scripts/ScriptsPanel'
import { useScriptsStore } from './stores/scriptsStore'
import { useScriptsSettingsStore } from './stores/scriptsSettingsStore'
import { runScriptInNewTerminal, runScriptInAgentTerminal } from './lib/runScript'
import { LlamaPanel } from './components/Llama/LlamaPanel'
import { useDoneFeedbackStore } from './stores/doneFeedbackStore'
import { handleTurnDone } from './lib/doneFeedback'
import { DoneModeMenu, DoneModeIcon } from './components/ActivityBar/DoneModeMenu'
import { useConfigRepoStore } from './stores/configRepoStore'
import { startThemeShuffle } from './stores/themeShuffleStore'
import type { AssistantKind, MemoryBreakdown } from './types/api'

// Rendered once at the app root rather than per-TabBar: Cmd+W is handled here,
// and the prompt has to appear whichever route asked to close the tab.
function DiscardScratchPromptHost() {
  const pending = useDiscardScratchStore((s) => s.pending)
  const clear = useDiscardScratchStore((s) => s.clear)
  if (!pending) return null
  return (
    <ConfirmDiscardScratchModal
      count={pending.kind === 'tab' ? 1 : pending.count}
      onConfirm={() => {
        const store = useEditorStore.getState()
        if (pending.kind === 'all') store.closeAllTabs()
        else if (pending.kind === 'others') store.closeOtherTabs(pending.keepPath)
        else store.closeTabInPane(pending.paneId, pending.path)
        clear()
      }}
      onClose={clear}
    />
  )
}

// Must match CLAUDE_TAB_ID in electron/browserViews.ts — same reserved id,
// addressed independently by both sides (main creates/navigates the view,
// renderer opens/focuses its tab-strip entry for it).
const CLAUDE_BROWSER_ID = 'claude-controlled'
const GIT_POLL_INTERVAL_MS = 3000
const MEMORY_POLL_INTERVAL_MS = 3000
// Panel widths in rem (see lib/remPanelSize.ts). New keys on purpose: the old
// 'vide:layout:sidebarSize'/'chatSize' held percentages of the window, so
// everyone starts once from the new rem defaults instead of a converted guess.
const SIDEBAR_WIDTH_KEY = 'vide:layout:sidebarWidthRem'
const CHAT_WIDTH_KEY = 'vide:layout:chatWidthRem'
const MAIN_PANEL_GROUP_ID = 'main-layout'
// The initial-project pull below must run once per page load: main hands the
// project out exactly once, so StrictMode's dev-only second effect run got
// null and restoreRoot() loaded the last project over the requested one.
let initialProjectRequested = false

function readRootPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}


// Title and icon for an app listed in All Apps' Disabled section.
const DISABLED_APP_LABELS: Record<MovableAppId, { title: string; icon: ReactNode }> = {
  llama: { title: 'Llama', icon: <LlamaIcon /> },
  mobile: { title: 'Mobile Display', icon: <PhoneIcon /> },
  graphify: { title: 'Graphify', icon: <GraphIcon /> },
  todos: { title: 'To Do', icon: <TodoIcon /> },
  notes: { title: 'Notes', icon: <NotesIcon /> },
  scripts: { title: 'Scripts', icon: <ScriptsIcon /> },
}

function openAppSettings(id: MovableAppId) {
  useEditorStore.getState().openTab({ path: APP_SETTINGS_PATHS[id], content: '', dirty: false })
}

export default function App() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const storeApps = useAppContribStore((s) => s.apps)
  const runtimeErrors = useAppContribStore((s) => s.runtimeErrors)
  const appPanels = useAppContribStore((s) => s.panels)
  const appSettingsPages = useAppContribStore((s) => s.settingsPages)
  const appPanelRequest = useAppContribStore((s) => s.panelRequest)
  const appSidePanelCloseRequest = useAppContribStore((s) => s.sidePanelCloseRequest)
  const appLaunchers = useAppContribStore((s) => s.launchers)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const refreshGitStatus = useGitStore((s) => s.refreshStatus)
  const instances = useClaudeStore((s) => s.instances)
  const activeInstanceId = useClaudeStore((s) => s.activeInstanceId)
  const usageOpen = useClaudeStore((s) => s.usageOpen)
  const costOpen = useClaudeStore((s) => s.costOpen)
  const chatVisible = useClaudeStore((s) => s.chatVisible)
  const enabledModels = useModelSettingsStore((s) => s.enabled)
  const llamaModels = useLlamaModelsStore((s) => s.models)
  const llamaRuns = useLlamaStore((s) => s.runs)
  const activeSession = useClaudeStore(selectActiveSession)
  const hasClaudeSession = instances.some((inst) => isClaudeLike(inst.kind))
  const [newSessionMenu, setNewSessionMenu] = useState<DOMRect | null>(null)
  // Stable identity: NewSessionMenu's window listeners depend on onClose, so an
  // inline arrow would tear down and re-add them on every App render.
  const closeNewSessionMenu = useCallback(() => setNewSessionMenu(null), [])
  const [doneModeMenu, setDoneModeMenu] = useState<DOMRect | null>(null)
  const closeDoneModeMenu = useCallback(() => setDoneModeMenu(null), [])
  const agentOptions = availableAgents(enabledModels, llamaModels).map((o) => ({
    ...o,
    running: isLlamaKind(o.kind) ? Boolean(llamaRuns[llamaModelId(o.kind)]?.running) : undefined,
  }))
  const repoName = projectRoot ? projectRoot.split('/').pop() : null
  const [leftPanel, setLeftPanel] = useState<'files' | 'search' | 'git' | 'mobile' | 'graphify' | 'todos' | 'notes' | 'scripts' | 'llama' | 'settings' | 'apps' | `app:${string}` | null>('files')
  const appFavorites = useAppFavoritesStore((s) => s.favorites)
  const placeFavorite = useAppFavoritesStore((s) => s.place)
  const unfavoriteApp = useAppFavoritesStore((s) => s.unfavorite)
  // The bar's temporary slot: the last unfavorited app that was opened.
  const lastTemporaryAppRef = useRef<string | null>(null)
  const lastLeftPanelRef = useRef<'files' | 'search' | 'git' | 'mobile' | 'graphify' | 'todos' | 'notes' | 'scripts' | 'llama' | 'settings' | 'apps' | `app:${string}`>('files')
  const [sidebarRem, setSidebarRem] = useState(() => loadRem(SIDEBAR_WIDTH_KEY, SIDEBAR_PANEL))
  const [chatRem, setChatRem] = useState(() => loadRem(CHAT_WIDTH_KEY, CHAT_PANEL))
  // The panel group's width and the root font size: the two numbers needed to
  // turn the rem widths into the percentages the panels are sized in.
  const [groupPx, setGroupPx] = useState(() => window.innerWidth)
  const [rootPx, setRootPx] = useState(readRootPx)
  // Only a drag on a resize handle saves a new width (see onMainLayoutChanged).
  // Window resizes, text size changes and expand/collapse just re-apply the
  // saved rem width, so a temporarily small window can't permanently shrink
  // the panels.
  // Whether the sidebar was collapsed in the main group's last layout, so a
  // drag that collapses it closes the side panel.
  const sidebarCollapsedRef = useRef(false)
  const [sessionMenu, setSessionMenu] = useState<{ x: number; y: number; instanceId: string; kind: AssistantKind } | null>(null)
  const [renamingInstanceId, setRenamingInstanceId] = useState<string | null>(null)
  const titleByInstance = useClaudeStore((s) => s.titleByInstance)
  const terminalIds = instances.filter((inst) => isTerminalKind(inst.kind)).map((inst) => inst.id)
  const autoTitleFor = (inst: { id: string; kind: AssistantKind }) =>
    isTerminalKind(inst.kind) ? terminalSessionTitle(terminalIds.indexOf(inst.id)) : titleByInstance[inst.id]
  const agentBarCollapsed = useClaudeStore((s) => s.agentBarCollapsed)
  // 'hover' replaces the collapse toggle with icons that widen on hover.
  const agentBarHover = useGeneralSettingsStore((s) => s.agentBarMode) === 'hover'
  const [memoryUsage, setMemoryUsage] = useState<SystemUsage | null>(null)
  const commandPaletteOpen = useSearchStore((s) => s.commandPaletteOpen)
  const actionPaletteOpen = useSearchStore((s) => s.actionPaletteOpen)
  const shortcutsOverlayOpen = useSearchStore((s) => s.shortcutsOverlayOpen)
  const recentProjectsPaletteOpen = useSearchStore((s) => s.recentProjectsPaletteOpen)
  const branchPaletteOpen = useSearchStore((s) => s.branchPaletteOpen)
  const chatPanelRef = useRef<PanelImperativeHandle>(null)
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null)
  // useActiveRepo() matches what the Git panel itself actually shows: a
  // single discovered repo has no open/close chrome, so it always counts
  // (VIDE-18/open-close); in a multi-repo project it's the one repo whose
  // body is expanded (GitPanel's single-expand accordion), or null once
  // nothing is open — never a stale count for a repo the panel shows
  // nothing for (VIDE-87), and never a sum across every open repo (that
  // reads as "everything that changed everywhere," not "what's on screen").
  const activeRepo = useActiveRepo()
  const badgeStatus = useRepoGitState(activeRepo).status
  const uncommittedChangeCount = new Set([
    ...badgeStatus.staged.map((file) => file.path),
    ...badgeStatus.unstaged.map((file) => file.path),
  ]).size
  const gitBadge = uncommittedChangeCount > 99 ? '99+' : uncommittedChangeCount || undefined
  const mobileState = useMobileStore((s) => s.state)
  const mobileBadge = mobileState.running && mobileState.connectedCount > 0 ? mobileState.connectedCount : undefined
  const theme = useThemeStore((s) => s.theme)
  const font = useDisplayStore((s) => s.font)
  const memoryUsageVisible = useDisplayStore((s) => s.memoryUsageVisible)
  const batteryVisible = useDisplayStore((s) => s.batteryVisible)
  const doneMode = useDoneFeedbackStore((s) => s.mode)
  const backgroundImage = useDisplayStore((s) => s.backgroundImage)
  const navbarPosition = useDisplayStore((s) => s.navbarPosition)
  const mirrored = navbarPosition === 'right'
  const periodicFetchEnabled = useGitSettingsStore((s) => s.periodicFetchEnabled)
  const periodicFetchIntervalMinutes = useGitSettingsStore((s) => s.periodicFetchIntervalMinutes)
  const activeTabPath = useEditorStore((s) => s.activeTabPath)
  useEffect(() => {
    useConfigRepoStore.getState().syncOnLaunch()
  }, [])
  useEffect(() => startThemeShuffle(), [])

  // Scripts live in the main process (and are written by the vide-scripts
  // MCP server and vIDE Sync too), so reload on every change it reports.
  // run_script from Claude arrives as a request to open a terminal here.
  useEffect(() => {
    const reload = () => { void useScriptsStore.getState().load().catch(() => {}) }
    reload()
    const offChanged = window.api.onScriptsChanged(reload)
    const offRun = window.api.onScriptRunRequest(async (req) => {
      await useScriptsStore.getState().load().catch(() => {})
      const script = useScriptsStore.getState().scripts.find((s) => s.id === req.scriptId)
      if (script) runScriptInNewTerminal(script, req.command, req.terminalId)
    })
    return () => { offChanged(); offRun() }
  }, [])

  usePanelRequests(setLeftPanel)
  const gitPanelOpenRequest = useGitPanelOpenAlertStore((s) => s.openRequest)
  useEffect(() => {
    if (!gitPanelOpenRequest) return
    setLeftPanel('git')
  }, [gitPanelOpenRequest])
  const mobileEnabled = useMobileSettingsStore((s) => s.enabled)
  const mobileDefaultMode = useMobileSettingsStore((s) => s.defaultMode)
  const todoEnabled = useTodoSettingsStore((s) => s.enabled)
  const notesEnabled = useNotesSettingsStore((s) => s.enabled)
  const scriptsEnabled = useScriptsSettingsStore((s) => s.enabled)
  const llamaEnabled = useLlamaSettingsStore((s) => s.enabled)
  const runningLlamaCount = useRunningLlamaCount(llamaEnabled)
  useLlamaAvailability(llamaEnabled)
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  // Hidden while it holds no terminals; the next one opened (Cmd+T, the
  // sidebar's button) is routed down here and brings the panel back.
  const bottomTerminalEnabled = useBottomTerminalStore((s) => s.enabled && s.sides.some((ids) => ids.length > 0))
  // Not subscribed: it only seeds the panel's height when the panel mounts,
  // and resizing shouldn't re-render the whole app.
  const bottomTerminalSize = useBottomTerminalStore.getState().size

  function openNewTerminal() {
    const id = Date.now().toString(36)
    useEditorStore.getState().openTab({ path: buildTerminalPath(id), content: '', dirty: false })
  }

  function openNewBrowser() {
    openNewBrowserTab()
    if (useBrowserSettingsStore.getState().closeSidePanelOnOpen) setLeftPanel(null)
  }

  // Opens (or focuses, if already open) the tab the vide-browser MCP server
  // drives on Claude's behalf (VIDE-53) — main process already created and
  // navigated the underlying view by the time this fires; this just surfaces
  // it in the tab strip, same as any other tab, so the user can watch.
  function openClaudeBrowserTab(url: string) {
    // Seed the store with the URL main just loaded, before the tab (and so
    // BrowserTab) mounts. Without it
    // BrowserTab would mount with an empty url, skip creating/registering the
    // native view it already has, and silently swallow the first manual
    // navigation the user types into that tab's address bar.
    useBrowserStore.getState().ensureTab(CLAUDE_BROWSER_ID, url)
    useEditorStore.getState().openTab({ path: buildBrowserPath(CLAUDE_BROWSER_ID), content: '', dirty: false })
  }

  const sidebarPercent = remToPercent(clampRem(sidebarRem, SIDEBAR_PANEL, groupPx, rootPx), groupPx, rootPx)
  const sidebarLimits = percentLimits(SIDEBAR_PANEL, groupPx, rootPx)
  const chatPercent = remToPercent(clampRem(chatRem, CHAT_PANEL, groupPx, rootPx), groupPx, rootPx)
  const chatLimits = percentLimits(CHAT_PANEL, groupPx, rootPx)

  // Sizes are strings: react-resizable-panels v4 reads a bare number as px.
  const pct = (percent: number) => `${percent}%`

  function saveRem(percent: number | undefined, key: string, set: (rem: number) => void) {
    if (percent === undefined || !(percent > 0) || groupPx <= 0) return
    const rem = percentToRem(percent, groupPx, rootPx)
    set(rem)
    localStorage.setItem(key, String(rem))
  }

  // Called once a layout change completes (for a drag: when the pointer is
  // released). A drag that leaves the sidebar collapsed closes the side panel
  // (v2's onCollapse) — read from the layout rather than the panel's pixel
  // size, which is 0/NaN while hidden. Only a user's own drag or keyboard
  // resize saves a width, never a window resize or expand/collapse.
  function onMainLayoutChanged(layout: Layout, meta: LayoutChangedMeta) {
    if (layout.sidebar !== undefined) {
      const collapsed = layout.sidebar <= 0
      if (collapsed && !sidebarCollapsedRef.current) setLeftPanel(null)
      sidebarCollapsedRef.current = collapsed
    }
    if (!meta.isUserInteraction) return
    saveRem(layout.sidebar, SIDEBAR_WIDTH_KEY, setSidebarRem)
    saveRem(layout.chat, CHAT_WIDTH_KEY, setChatRem)
  }

  const fontSize = useFontSizeStore((s) => s.fontSize)
  useEffect(() => {
    setRootPx(readRootPx())
  }, [fontSize])

  // Track the panel group's width. It remounts when the navbar swaps sides
  // or a project opens, hence the dependencies.
  useEffect(() => {
    const el = document.getElementById(MAIN_PANEL_GROUP_ID)
    if (!el || typeof ResizeObserver === 'undefined') return
    setGroupPx(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setGroupPx(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [mirrored, projectRoot])

  // Keep each open panel at its rem width as the window or text size changes.
  useEffect(() => {
    if (leftPanel !== null) sidebarPanelRef.current?.resize(pct(sidebarPercent))
    if (chatVisible) chatPanelRef.current?.resize(pct(chatPercent))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupPx, rootPx])

  useEffect(() => {
    useBridgeSettingsStore.getState().init()
    if (useMobileSettingsStore.getState().enabled) useMobileStore.getState().init()
    useNotesStore.getState().loadRoot()
  }, [])

  useEffect(() => {
    window.api.mobileSetDisplay(theme, font)
  }, [theme, font])

  useEffect(() => {
    window.api.mobileSetDefaultMode(mobileDefaultMode)
  }, [mobileDefaultMode])

  useEffect(() => {
    if (chatVisible) {
      chatPanelRef.current?.expand()
      chatPanelRef.current?.resize(pct(chatPercent))
    } else chatPanelRef.current?.collapse()
  }, [chatVisible])

  // No project open means no assistant terminal to show, so the chat panel
  // is forced closed (and its toggle disabled, see the ActivityBar item
  // below) rather than sitting open on an empty state. Auto-reopens the
  // moment a project first resolves — on launch restore or a fresh Open
  // Folder — but a later project SWITCH (already had one, picked another)
  // doesn't re-force it open, respecting whatever the user set it to.
  const hadProjectRef = useRef(false)
  useEffect(() => {
    if (!projectRoot) {
      useClaudeStore.getState().setChatVisible(false)
    } else if (!hadProjectRef.current) {
      useClaudeStore.getState().setChatVisible(true)
    }
    hadProjectRef.current = !!projectRoot
  }, [projectRoot])

  // Restores the stacked Claude sessions (count + hue, never conversation
  // content — that's the CLI's own --continue/--resume, not vIDE's job) for
  // whichever project just opened. Falls back to a single fresh instance
  // when there's nothing saved yet (a project that predates this feature,
  // or a load failure — sessionLoad already resolves null in both cases).
  // The same session file also holds the project's open editor tabs.
  // The bottom terminal is per project too, restored after the editor tabs
  // so it can sweep in their terminals when it comes back switched on.
  useEffect(() => {
    resetBottomTerminal()
    if (!projectRoot) return
    let cancelled = false
    window.api.sessionLoad(projectRoot).then(async (data) => {
      if (cancelled) return
      useClaudeStore.getState().loadInstancesFromSession(data)
      await restoreEditorSession(projectRoot, data)
      if (!cancelled) restoreBottomTerminal(projectRoot, data)
    })
    return () => { cancelled = true }
  }, [projectRoot])

  useEffect(() => startEditorSessionPersistence(), [])
  useEffect(() => startBottomTerminalPersistence(), [])

  // Search/Git/Mobile Display/Graphify only make sense with a project open
  // (their ActivityBar icons disappear entirely when projectRoot is null,
  // see primaryActivityBar below) — fall back to Explorer so a project
  // closing mid-session doesn't strand the sidebar (or a later Cmd+B
  // reopen, which restores lastLeftPanelRef) on a now-icon-less panel.
  useEffect(() => {
    if (projectRoot) return
    const isProjectOnly = (p: typeof leftPanel) =>
      p === 'search' || p === 'git' || p === 'mobile' || p === 'graphify' ||
      storeAppPanelLeavesOnProjectClose(p, useAppContribStore.getState().panels)
    if (isProjectOnly(lastLeftPanelRef.current)) lastLeftPanelRef.current = 'files'
    setLeftPanel((p) => (isProjectOnly(p) ? 'files' : p))
  }, [projectRoot])

  // vide.ui.openPanel() from a store app: show that app's sidebar panel.
  useEffect(() => {
    const next = panelForRequest(appPanelRequest)
    if (next) setLeftPanel(next)
  }, [appPanelRequest?.seq])

  // vide.ui.closeSidePanel() from a store app (0 = never asked).
  useEffect(() => {
    if (appSidePanelCloseRequest > 0) setLeftPanel(null)
  }, [appSidePanelCloseRequest])

  // Mirrors the chat panel above: driven imperatively rather than
  // conditionally unmounted (see the sidebar Panel's own comment for why —
  // unmounting it here would re-trigger the exact desync this pattern
  // exists to avoid).
  useEffect(() => {
    if (leftPanel !== null) {
      sidebarPanelRef.current?.expand()
      sidebarPanelRef.current?.resize(pct(sidebarPercent))
    } else sidebarPanelRef.current?.collapse()
  }, [leftPanel])

  useEffect(() => {
    if (leftPanel !== null) lastLeftPanelRef.current = leftPanel
  }, [leftPanel])

  // "Reveal in File Tree" (from a commit's changed-files list, etc.) needs
  // the files panel actually visible for the reveal to be seen — Sidebar
  // owns consuming/clearing the request itself, this just switches to it.
  const revealRequest = useSidebarUiStore((s) => s.revealRequest)
  useEffect(() => {
    if (revealRequest) setLeftPanel('files')
  }, [revealRequest])

  // Find in Files (menu, or Cmd+Shift+F from inside Monaco) bumps focusTick;
  // switch to the Search panel, which focuses its own input on mount / bump.
  const searchFocusTick = useGlobalSearchStore((s) => s.focusTick)
  useEffect(() => {
    if (searchFocusTick > 0 && useFileStore.getState().projectRoot) setLeftPanel('search')
  }, [searchFocusTick])

  useEffect(() => {
    // Pull (not push): ask main whether this window was opened with a
    // specific initial project (New Window / Recent Projects) and await the
    // answer before deciding whether to fall back to restoreRoot() (the
    // shared localStorage last-project, used by the app-launch window). This
    // is deterministic — unlike the old push-based listener, which could
    // never actually observe an IPC message arriving before the very next
    // synchronous line ran — and reload-safe, since the main-process side is
    // one-shot per window and returns null on a later call.
    if (initialProjectRequested) return
    initialProjectRequested = true
    ;(async () => {
      const initialProject = await window.api.getInitialProject()
      if (initialProject) {
        useFileStore.getState().openProjectAt(initialProject)
      } else {
        useFileStore.getState().restoreRoot()
      }
    })()
  }, [])

  useHoldToShowShortcuts()

  useEffect(() => {
    refreshGitStatus(selectedRepo)
    const onFocus = () => refreshGitStatus(selectedRepo)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [selectedRepo, refreshGitStatus])

  // Mirrors VS Code: when the focused editor tab belongs to a different
  // repo than the one the Git Panel/footer are currently scoped to, follow
  // it automatically. followFilePath() itself decides whether the path
  // actually resolves to a different known repo and fires the "Switched
  // to…" footer notice — this effect just feeds it the active tab's path.
  useEffect(() => {
    if (!activeTabPath) return
    useGitReposStore.getState().followFilePath(activeTabPath)
  }, [activeTabPath])

  useGraphifyAutoBuild(activeRepo)
  useGraphifyHookRepair(activeRepo)
  useGraphifyPromptChecks(activeRepo)

  useEffect(() => {
    // Catches git state changes made outside the app's own UI — most
    // commonly commands run in the integrated terminal (checkout, commit,
    // pull...) — which the focus/action-based refreshes above never see.
    return window.api.onGitChanged((cwd) => {
      if (cwd === useGitReposStore.getState().selectedRepo) {
        useGitStore.getState().refresh(cwd)
      }
    })
  }, [])

  useEffect(() => {
    // Todos aren't scoped to a repo/window the way git state is — most
    // notably, the Todo MCP server can rewrite todos.json from a separate
    // process while a board is open, with no other signal reaching this
    // window's own IPC-driven state.
    return window.api.onTodosChanged(() => {
      useTodoStore.getState().refreshAll()
    })
  }, [])

  useEffect(() => {
    return window.api.onNotesChanged(() => {
      useNotesStore.getState().bumpSyncVersion()
    })
  }, [])

  useEffect(() => {
    return window.api.onRemoteSettingsApplied((kvMap) => {
      // Write all synced values to localStorage so stores pick them up on
      // next read, then reactively apply the ones that affect visible UI.
      for (const [key, val] of Object.entries(kvMap)) {
        localStorage.setItem(key, val)
      }
      const themeStore = useThemeStore.getState()
      if ('vide:themeMatchSystem' in kvMap) {
        themeStore.setMatchSystem(kvMap['vide:themeMatchSystem'] === 'true')
      }
      if ('vide:theme' in kvMap) {
        themeStore.setTheme(kvMap['vide:theme'] as ThemeId)
      }
      if ('vide:fontSize' in kvMap) {
        const n = parseInt(kvMap['vide:fontSize'], 10)
        if (!isNaN(n)) useFontSizeStore.getState().setFontSize(n)
      }
    })
  }, [])

  useEffect(() => {
    // Drives the status-icon animation only. The done sound / speech comes
    // from the Stop hook below, which knows a turn really ended — this busy
    // signal is a PTY-output heuristic that also fires on redraws and goes
    // idle during quiet stretches inside a long turn.
    return window.api.onClaudeBusy((instanceId, busy) => {
      useClaudeStore.getState().setBusy(instanceId, busy)
    })
  }, [])

  useEffect(() => {
    return window.api.onClaudeTurnDone((instanceId, text) => {
      handleTurnDone(useClaudeStore.getState().instances, instanceId, text).catch(() => {})
    })
  }, [])

  useEffect(() => {
    // Catches file changes made outside the app's own UI — Finder, an
    // external editor, a build script, `mkdir`/`touch` in a terminal, an
    // agent (Claude/Bridge) editing files directly — which the app's
    // own create/rename/delete actions already refresh for, but nothing else
    // does. Also refreshes the Git Panel's staged/unstaged list: a content
    // edit only touches the working tree, never `.git/*`, so GitWatcher's
    // metadata-only watch never sees it — this is the only path that does.
    // Same reasoning applies to any open editor tab for that file: without
    // this, the tab shows stale content until closed and reopened, and
    // autosave will happily write that stale content back over the change.
    return window.api.onFsChanged((cwd, paths) => {
      if (cwd === useFileStore.getState().projectRoot) {
        useFileStore.getState().refreshTree()
        refreshRepoStatuses(cwd, paths)
        syncOpenTabsFromDisk()
      }
    })
  }, [])

  useEffect(() => {
    // Belt-and-suspenders for the two watchers above: GitWatcher/FileWatcher
    // rely on native fs events (chokidar/fsevents), which — like most native
    // file watchers — occasionally miss or delay changes in real-world,
    // long-running sessions (this showed up as the Git panel's staged/
    // unstaged counts going stale after teammates or an external terminal
    // changed the repo, only correcting once some unrelated action, e.g.
    // "Stage All", happened to trigger a refresh as a side effect). Polling
    // puts a hard upper bound on that staleness regardless of why a given
    // fs event was missed.
    if (!projectRoot) return
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      useGitStore.getState().refresh(projectRoot)
    }, GIT_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [projectRoot])

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== 'visible') return
      window.api.getSystemMemoryUsage().then(setMemoryUsage).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, MEMORY_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Refresh from the remote once whenever a repo is opened, so ahead/
    // behind and remote branches reflect reality from the start rather than
    // whatever was last fetched (possibly in a previous session).
    if (!projectRoot) return
    useGitStore.getState().fetchSilent(projectRoot)
  }, [projectRoot])

  useEffect(() => {
    if (!projectRoot || !periodicFetchEnabled) return
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      useGitStore.getState().fetchSilent(projectRoot)
    }, periodicFetchIntervalMinutes * 60_000)
    return () => clearInterval(interval)
  }, [projectRoot, periodicFetchEnabled, periodicFetchIntervalMinutes])

  useEffect(() => {
    window.api.updateGetLatest().then((info) => useUpdateStore.getState().setAvailable(info))
    return window.api.onUpdateAvailable((info) => useUpdateStore.getState().setAvailable(info))
  }, [])

  useEffect(() => {
    return window.api.onUpdateUpToDate((version) => useUpdateStore.getState().showUpToDate(version))
  }, [])

  // Deliberately a passive listener only — no usageAcquire() call here, so
  // this doesn't itself become a fourth reason the shared poller keeps
  // running (see UsageManager). It just forwards whatever usage:update
  // pushes already happen to arrive, from whichever of desktop/mobile/
  // passive is actually driving the poller, into the footer's alert store.
  useEffect(() => {
    window.api.usageGetLatest().then((latest) => useUsageAlertStore.getState().handleUpdate(latest))
    return window.api.onUsageUpdate((latest) => useUsageAlertStore.getState().handleUpdate(latest))
  }, [])

  useEffect(() => {
    useChangelogStore.getState().checkPending()
  }, [])

  useEffect(() => {
    useOnboardingStore.getState().checkStatus()
  }, [])

  useEffect(() => {
    return window.api.onMenuOpenProject(() => {
      useFileStore.getState().openFolder()
    })
  }, [])

  useEffect(() => {
    return window.api.onBrowserOpenExternalUrl((url) => {
      openUrlInBrowserTab(url)
    })
  }, [])

  useEffect(() => {
    return window.api.onOpenClaudeBrowserTab((url) => {
      openClaudeBrowserTab(url)
    })
  }, [])

  // Keeps the main process's per-window tally current so its 'close' handler
  // — which is synchronous and can't ask the renderer anything — knows whether
  // to warn. Recounted on every tab change, since closing or saving a tab
  // changes the answer too, but only sent when the counts actually move:
  // tab content lives in `tabs`, so every keystroke lands here.
  useEffect(() => {
    let last: UnsavedState | null = null
    const push = (tabs: Tab[]) => {
      const next = countUnsaved(tabs)
      if (last && last.dirty === next.dirty && last.neverSaved === next.neverSaved) return
      last = next
      window.api.setUnsavedState(next)
    }
    push(useEditorStore.getState().tabs)
    return useEditorStore.subscribe((state, prev) => {
      if (state.tabs !== prev.tabs) push(state.tabs)
    })
  }, [])

  const pendingPinnedCloseRef = useRef<PendingClose | null>(null)
  useEffect(() => {
    return window.api.onMenuCloseActiveTab(() => {
      // A focused bottom terminal owns Cmd+W: close its tab, not the editor's.
      const side = focusedBottomTerminalSide(document.activeElement)
      if (side !== null) {
        const bottom = useBottomTerminalStore.getState()
        const id = bottom.active[side]
        if (id) {
          bottom.setFocusedSide(side)
          bottom.closeTerminal(id)
          focusAfterTerminalClose({
            nextTerminalId: () => {
              const { active, focusedSide } = useBottomTerminalStore.getState()
              return active[focusedSide] ?? active.find((a) => a) ?? null
            },
            focusTerminal: (next) => liveTerminals.get(next)?.xterm.focus(),
            activePaneId: () => useEditorStore.getState().activePaneId,
          })
        }
        return
      }
      // Same for a plain terminal session in the agent panel (never a Claude
      // session — those aren't marked). Focus follows to the session that
      // becomes active only if it is a terminal too, else to the editor.
      const sessionId = focusedAgentTerminalSession(document.activeElement)
      const root = useFileStore.getState().projectRoot
      if (sessionId && root) {
        useClaudeStore.getState().closeInstance(root, sessionId)
        focusAfterTerminalClose({
          nextTerminalId: () => {
            const { instances, activeInstanceId } = useClaudeStore.getState()
            const next = instances.find((inst) => inst.id === activeInstanceId)
            return next && isTerminalKind(next.kind) ? next.id : null
          },
          focusTerminal: (next) => liveTerminals.get(next)?.xterm.focus(),
          activePaneId: () => useEditorStore.getState().activePaneId,
        })
        return
      }
      const { activePaneId, paneTabs, pinnedPaths } = useEditorStore.getState()
      const path = paneTabs[activePaneId]
      if (!path) return
      const { shouldClose, nextPending } = evaluateCmdWForPinnedTab(
        path,
        pinnedPaths.has(path),
        pendingPinnedCloseRef.current,
        Date.now()
      )
      pendingPinnedCloseRef.current = nextPending
      // requestCloseTab rather than closeActiveTab: Cmd+W must raise the same
      // unsaved-scratch confirmation the tab's own × button does.
      if (shouldClose) requestCloseTab(activePaneId, path)
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuZoomIn(() => {
      useFontSizeStore.getState().increase()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuZoomOut(() => {
      useFontSizeStore.getState().decrease()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuResetZoom(() => {
      useFontSizeStore.getState().reset()
      useInstanceFontSizeStore.getState().resetAll()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuOpenSettings(() => {
      setLeftPanel('settings')
    })
  }, [])

  useEffect(() => {
    // A scratch buffer, not a file on disk — naming and location are deferred
    // to the first Cmd+S. Creating a real file at a chosen path is still the
    // file tree's right-click > Create File, which targets the folder you
    // clicked rather than the project root this used to.
    return window.api.onMenuNewFile(() => {
      useEditorStore.getState().openScratchTab()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuNewFolder(() => {
      setLeftPanel('files')
      useSidebarUiStore.getState().requestCreate('directory')
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuNewTerminal(() => {
      openNewTerminal()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuReloadActive(() => {
      // Focus in a terminal or agent panel (both xterm): leave the live
      // session alone rather than reloading whatever editor tab is active.
      if (document.activeElement?.closest('.xterm')) return
      useEditorStore.getState().requestReloadActive()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuReopenClosedTab(() => {
      useEditorStore.getState().reopenLastClosed()
    })
  }, [])

  useEffect(() => {
    // Cmd+F is bound inside each editor pane (Editor.tsx); this backs the Edit
    // menu's "Find" item by opening the find box in the active pane.
    return window.api.onMenuFind(() => {
      useEditorFindStore.getState().openFind(useEditorStore.getState().activePaneId)
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuFindInFiles(() => {
      if (!useFileStore.getState().projectRoot) return
      useGlobalSearchStore.getState().requestFocus()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuToggleSidebar(() => {
      setLeftPanel((p) => (p !== null ? null : lastLeftPanelRef.current))
    })
  }, [])

  // Belt-and-suspenders for the handler above: the native Electron menu
  // accelerator (CmdOrCtrl+B) is supposed to fire regardless of what's
  // focused in the renderer, but in practice it's unreliable while Monaco
  // has focus — its hidden textarea's own keydown handling can swallow the
  // keystroke before Electron's native accelerator layer ever sees it,
  // so toggling the sidebar back open (or closed) silently does nothing
  // until focus moves elsewhere. A capture-phase listener on window fires
  // before Monaco's own handler regardless (capture runs top-down before
  // the event reaches the target/bubble phase), so it can't be swallowed
  // the same way — this is the primary, reliable path; the IPC/menu path
  // above still covers triggering it from the actual menu bar.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isToggleSidebar = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b'
      if (!isToggleSidebar) return
      e.preventDefault()
      e.stopPropagation()
      setLeftPanel((p) => (p !== null ? null : lastLeftPanelRef.current))
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => {
    return window.api.onMenuCommandPalette(() => {
      if (!useFileStore.getState().projectRoot) return
      useSearchStore.getState().openCommandPalette()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuActionPalette(() => {
      useSearchStore.getState().openActionPalette()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuRecentProjectsPalette(() => {
      useSearchStore.getState().openRecentProjectsPalette()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuToggleClaudeChat(() => {
      useClaudeStore.getState().focusChat()
    })
  }, [])

  useEffect(() => {
    const unsub = useBridgeStore.getState().initEventListener()
    return unsub
  }, [])

  return (
    <div className="w-screen h-screen overflow-hidden bg-panel flex flex-col relative isolate">
      {backgroundImage !== 'none' && (
        <div
          className="app-bg-badge"
          style={backgroundImageStyle(backgroundImage)}
          aria-hidden="true"
        />
      )}
      <EasterEgg />
      <div
        className="app-frame relative z-50 h-8 shrink-0 flex items-center justify-center bg-tab-bar border-b border-border"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {repoName && (
          <span className="text-sm font-medium text-fg-muted">{repoName}</span>
        )}
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          {memoryUsageVisible && memoryUsage && <MemoryPill usage={memoryUsage} />}
          {batteryVisible && <BatteryPill withDivider={!!(memoryUsageVisible && memoryUsage)} />}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {(() => {
          // File Tree, Search and Git are locked at the top. Every other app
          // is listed in the All Apps panel, and the favorites (starred there)
          // also sit on the bar, user-ordered and draggable. A disabled app
          // appears nowhere (null here).
          const togglePanel = (id: NonNullable<typeof leftPanel>) => () => setLeftPanel((p) => (p === id ? null : id))
          const lockedItems: ActivityBarItem[] = [
            {
              id: 'files',
              icon: <FilesIcon />,
              title: 'Site Tree',
              active: leftPanel === 'files',
              onClick: togglePanel('files'),
            },
            ...(projectRoot ? [{
              id: 'search',
              icon: <SearchIcon />,
              title: 'Search',
              active: leftPanel === 'search',
              onClick: togglePanel('search'),
            }] : []),
            ...(projectRoot ? [{
              id: 'git',
              icon: <GitIcon />,
              title: 'Git',
              active: leftPanel === 'git',
              badge: gitBadge,
              onClick: togglePanel('git'),
            }] : []),
          ]
          const builtInItems: Record<MovableAppId, ActivityBarItem | null> = {
            llama: llamaEnabled ? {
              id: 'llama',
              icon: <LlamaIcon />,
              title: 'Llama',
              active: leftPanel === 'llama',
              badge: runningLlamaCount > 0 ? runningLlamaCount : undefined,
              onClick: togglePanel('llama'),
            } : null,
            mobile: mobileEnabled && projectRoot ? {
              id: 'mobile',
              icon: <PhoneIcon />,
              title: 'Mobile Display',
              active: leftPanel === 'mobile',
              badge: mobileBadge,
              onClick: togglePanel('mobile'),
            } : null,
            graphify: graphifyEnabled && projectRoot ? {
              id: 'graphify',
              icon: <GraphIcon />,
              title: 'Graphify',
              active: leftPanel === 'graphify',
              onClick: togglePanel('graphify'),
            } : null,
            todos: todoEnabled ? {
              id: 'todos',
              icon: <TodoIcon />,
              title: 'To Do',
              active: leftPanel === 'todos',
              onClick: togglePanel('todos'),
            } : null,
            notes: notesEnabled ? {
              id: 'notes',
              icon: <NotesIcon />,
              title: 'Notes',
              active: leftPanel === 'notes',
              onClick: togglePanel('notes'),
            } : null,
            scripts: scriptsEnabled ? {
              id: 'scripts',
              icon: <ScriptsIcon />,
              title: 'Scripts',
              active: leftPanel === 'scripts',
              onClick: togglePanel('scripts'),
            } : null,
          }
          // Installed store apps with a panel can sit on the bar too (`app:<id>`).
          const storeBarItems = buildStoreAppBarItems({
            apps: storeApps, runtimeErrors, panels: appPanels, launchers: appLaunchers, projectOpen: !!projectRoot, activePanel: leftPanel,
            togglePanel: (appId) => setLeftPanel((p) => (p === `app:${appId}` ? null : `app:${appId}`)),
          })
          const appItems: Record<string, ActivityBarItem | null> = { ...builtInItems, ...storeBarItems }
          const enabledApps = Object.keys(appItems).filter((id) => appItems[id])
          const { favorites: favoriteIds, others: otherIds } = splitApps(enabledApps, appFavorites)
          const favoriteItems = favoriteIds.map((id): ActivityBarItem => ({ ...appItems[id]!, dragId: id }))
          // An unfavorited app opened from All Apps shows under the separator
          // and stays there after you switch away, until another unfavorited
          // app takes its place. Not persisted: a restart clears it.
          const temporaryId = pickTemporaryApp(otherIds, otherIds.find((id) => appItems[id]!.active), lastTemporaryAppRef.current)
          lastTemporaryAppRef.current = temporaryId
          const temporaryItem = temporaryId ? appItems[temporaryId]! : undefined
          const storeEntries = buildStoreAppEntries({
            apps: storeApps, runtimeErrors, panels: appPanels, launchers: appLaunchers, settingsPages: appSettingsPages,
            projectOpen: !!projectRoot, favorites: favoriteIds,
            openPanel: (appId) => setLeftPanel((p) => (p === `app:${appId}` ? null : `app:${appId}`)),
            openSettings: (appId) => useEditorStore.getState().openTab({ path: buildAppSettingsPath(appId), content: '', dirty: false }),
            uninstall: (appId) => window.api.appsUninstall(appId),
            setEnabled: (appId, enabled) => window.api.appsSetEnabled(appId, enabled),
          })
          const storeDisabledEntries = buildStoreDisabledEntries({
            apps: storeApps,
            setEnabled: (appId, enabled) => window.api.appsSetEnabled(appId, enabled),
            uninstall: (appId) => window.api.appsUninstall(appId),
          })
          // Badges of unfavorited apps are otherwise only visible inside the
          // panel, so All Apps carries a dot for them (the temporary slot
          // already shows its own).
          const hiddenBadge = storeEntriesHaveBadge(storeEntries) || otherIds.some((id) => appItems[id] !== temporaryItem && hasBadge(appItems[id]!.badge))
          const storeItem: ActivityBarItem = {
            id: 'store',
            icon: <StoreIcon />,
            title: 'Store',
            // Opens a tab, like New Browser Tab / New Terminal, so it never shows as selected.
            active: false,
            onClick: () => useEditorStore.getState().openTab({ path: STORE_TAB_PATH, content: '', dirty: false }),
          }
          const primaryGroups: ActivityBarItem[][] = [
            [...lockedItems, ...favoriteItems],
            ...(enabledApps.length > 0 || storeEntries.length > 0 || storeDisabledEntries.length > 0 ? [[
              ...(temporaryItem ? [temporaryItem] : []),
              {
                id: 'apps',
                icon: <AllAppsIcon />,
                title: 'All Apps',
                active: leftPanel === 'apps',
                onClick: togglePanel('apps'),
                dot: hiddenBadge,
                // Dropping a favorite or All Apps row here appends it.
                dragId: APPEND_TARGET,
                dropOnly: true,
              },
              storeItem,
            ]] : [[storeItem]]),
          ]
          // Every enabled app, favorites included (the star shows which), with
          // favorites in their bar order and the rest in the default order.
          const builtInEntries: AllAppsEntry[] = [...favoriteIds, ...MOVABLE_APP_IDS.filter((id) => !favoriteIds.includes(id))].filter((id): id is MovableAppId => isMovableAppId(id) && !!appItems[id]).map((id) => ({
            id,
            title: appItems[id]!.title,
            icon: appItems[id]!.icon,
            favorite: favoriteIds.includes(id),
            badge: appItems[id]!.badge,
            onOpen: appItems[id]!.onClick,
            onSettings: () => openAppSettings(id),
            onDisable: appEnabledSetter(id) ? () => appEnabledSetter(id)!(false) : undefined,
          }))
          const unsortedEntries = [...builtInEntries, ...storeEntries]
          const allAppsEntries: AllAppsEntry[] = [
            ...favoriteIds.flatMap((id) => unsortedEntries.filter((e) => e.id === id)),
            ...unsortedEntries.filter((e) => !favoriteIds.includes(e.id)),
          ]
          // Apps whose Enable switch is off, for All Apps' Disabled section.
          const appEnabled: Partial<Record<MovableAppId, boolean>> = {
            llama: llamaEnabled, mobile: mobileEnabled, graphify: graphifyEnabled,
            todos: todoEnabled, notes: notesEnabled, scripts: scriptsEnabled,
          }
          const disabledAppEntries: DisabledAppEntry[] = [...MOVABLE_APP_IDS.filter((id): id is keyof typeof DISABLED_APP_LABELS => appEnabled[id] === false).map((id) => ({
            id,
            title: DISABLED_APP_LABELS[id].title,
            icon: DISABLED_APP_LABELS[id].icon,
            onEnable: () => appEnabledSetter(id)!(true),
            onSettings: () => openAppSettings(id),
          })), ...storeDisabledEntries]
          const primaryActivityBar = (
        <ActivityBar
          side={mirrored ? 'right' : 'left'}
          groups={primaryGroups}
          onReorder={(dragId, targetId, placement) => {
            // A disabled app dragged from All Apps onto the bar is turned on too.
            disabledAppEntries.find((entry) => entry.id === dragId)?.onEnable()
            placeFavorite(dragId, targetId, placement)
          }}
          dragMime={APP_DRAG_MIME}
          bottomGroups={[[
            {
              id: 'browser',
              icon: <BrowserIcon />,
              title: 'New Browser Tab',
              active: false,
              onClick: openNewBrowser,
            },
            {
              id: 'terminal',
              icon: <TerminalIcon />,
              title: 'New Terminal',
              active: false,
              onClick: openNewTerminal,
            },
          ], [
            {
              id: 'settings',
              icon: <SettingsIcon />,
              title: 'Settings',
              active: leftPanel === 'settings',
              onClick: () => setLeftPanel((p) => (p === 'settings' ? null : 'settings')),
            },
          ]]}
        />
          )

          const sidebarPanel = (
          <Panel
            key="sidebar"
            panelRef={sidebarPanelRef}
            defaultSize={pct(sidebarPercent)}
            minSize={pct(sidebarLimits.min)}
            maxSize={pct(sidebarLimits.max)}
            collapsible
            collapsedSize="0%"
            id="sidebar"
          >
            {(() => {
              const activeLeftPanel = leftPanel ?? lastLeftPanelRef.current
              return activeLeftPanel === 'files' ? <Sidebar /> : activeLeftPanel === 'search' ? <SearchPanel /> : activeLeftPanel === 'git' ? <GitPanel /> : activeLeftPanel === 'mobile' ? <MobileDisplayPanel /> : activeLeftPanel === 'graphify' ? <GraphifyPanel /> : activeLeftPanel === 'todos' ? <TodoPanel /> : activeLeftPanel === 'notes' ? <NotesPanel /> : activeLeftPanel === 'scripts' ? <ScriptsPanel /> : activeLeftPanel === 'llama' ? <LlamaPanel /> : activeLeftPanel.startsWith('app:') ? <StoreAppPanel appId={activeLeftPanel.slice(4)} /> : activeLeftPanel === 'apps' ? (
                <AllAppsPanel
                  apps={allAppsEntries}
                  disabledApps={disabledAppEntries}
                  open={leftPanel === 'apps'}
                  onPlace={(id, beforeId) => placeFavorite(id, beforeId ?? APPEND_TARGET, beforeId ? 'before' : 'after')}
                  onUnfavorite={unfavoriteApp}
                />
              ) : <SettingsPanel />
            })()}
          </Panel>
          )
          const sidebarHandle = (
          <Separator key="sidebar-handle" disableDoubleClick disabled={!leftPanel} className={`w-px bg-border hover:bg-accent/60 transition-colors cursor-col-resize ${leftPanel ? '' : 'hidden'}`} />
          )

          // Always a vertical group, so switching the bottom terminal on or
          // off adds a panel beside the editor instead of remounting it.
          const centerPanel = (
          <Panel key="center" id="center">
            <Group id="center-column" orientation="vertical">
              <Panel id="editor" minSize="15%">
                <Editor />
              </Panel>
              {bottomTerminalEnabled && (
                <>
                  <Separator disableDoubleClick className="h-px bg-border hover:bg-accent/60 transition-colors cursor-row-resize" />
                  <Panel
                    id="bottom-terminal"
                    defaultSize={pct(bottomTerminalSize)}
                    minSize="10%"
                    onResize={(size) => useBottomTerminalStore.getState().setSize(size.asPercentage)}
                  >
                    <BottomTerminal />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          )

          const chatHandle = (
          <Separator key="chat-handle" disableDoubleClick disabled={!chatVisible} className={`w-px bg-border hover:bg-accent/60 transition-colors cursor-col-resize ${chatVisible ? '' : 'hidden'}`} />
          )
          const chatPanel = (
          <Panel
            key="chat"
            panelRef={chatPanelRef}
            defaultSize={pct(chatPercent)}
            minSize={pct(chatLimits.min)}
            maxSize={pct(chatLimits.max)}
            collapsible
            id="chat"
          >
            <Chat />
          </Panel>
          )

          const claudeActivityBar = projectRoot && (
        <ActivityBar
          side={mirrored ? 'left' : 'right'}
          showAccent={false}
          dense
          wide={!agentBarHover && !agentBarCollapsed}
          expandOnHover={agentBarHover}
          edgeToggle={!agentBarHover ? {
            label: agentBarCollapsed ? 'Expand session names' : 'Collapse session names',
            onClick: () => useClaudeStore.getState().toggleAgentBarCollapsed(),
          } : undefined}
          groups={[
            [
              ...instances.map((inst, index) => ({
                id: inst.id,
                dragId: inst.id,
                icon: <SessionIcon session={inst} />,
                title: agentLabel(inst.kind, llamaModels),
                label: sessionDisplayName(inst, autoTitleFor(inst), index),
                rename: renamingInstanceId === inst.id ? {
                  initial: sessionDisplayName(inst, autoTitleFor(inst), index),
                  onCommit: (value: string) => {
                    // Committing the unchanged auto title/fallback shouldn't pin it as
                    // a custom name — it would stop following Claude's live title.
                    const auto = sessionDisplayName({}, autoTitleFor(inst), index)
                    if (projectRoot && value.trim() !== auto) {
                      useClaudeStore.getState().renameInstance(projectRoot, inst.id, value)
                    }
                    setRenamingInstanceId(null)
                  },
                  onCancel: () => setRenamingInstanceId(null),
                } : undefined,
                active: chatVisible && inst.id === activeInstanceId,
                disabled: !projectRoot,
                onClick: () => {
                  const store = useClaudeStore.getState()
                  if (inst.id !== activeInstanceId) {
                    store.setActiveInstance(inst.id)
                    store.setChatVisible(true)
                  } else {
                    store.toggleChatVisible()
                  }
                  // Put the cursor in the session so typing works straight
                  // away. A frame later: a Bridge chat only takes focus for a
                  // focusToken bumped after it mounted.
                  if (useClaudeStore.getState().chatVisible) {
                    requestAnimationFrame(() => useClaudeStore.getState().focusChat())
                  }
                },
                onContextMenu: (e: MouseEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSessionMenu({ x: e.clientX, y: e.clientY, instanceId: inst.id, kind: inst.kind })
                },
              })),
              {
                id: 'new-session',
                icon: <NewSessionPlusIcon />,
                title: 'New Session',
                iconOnly: true,
                active: newSessionMenu !== null,
                disabled: !projectRoot,
                onClick: (e: MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  setNewSessionMenu((open) => (open ? null : rect))
                },
              },
            ],
          ]}
          onReorder={(dragId, targetId, placement) => {
            if (projectRoot) useClaudeStore.getState().moveInstance(projectRoot, dragId, targetId, placement)
          }}
          bottomGroups={[
            [], // empty leading group so ItemGroups renders a divider above Compact
            // Previous/Resume Session live in the right-click menu on each
            // session icon (see ClaudeSessionContextMenu) — a toolbar button
            // can only act on "the" active session. Compact runs the CLI's
            // /compact for Claude and vIDE Compacting for Bridge/llama.
            // Usage/Cost/Usage Graph show account-wide Claude usage, so they
            // open from any agent session (not a plain terminal).
            [
              {
                id: 'compact',
                icon: <CompactIcon />,
                title: 'Compact',
                active: false,
                disabled: !projectRoot || !activeSession || isTerminalKind(activeSession.kind),
                onClick: () => useClaudeStore.getState().compact(),
              },
              {
                id: 'clear',
                icon: <ClearIcon />,
                title: 'Clear',
                active: false,
                disabled: !projectRoot || !activeSession,
                onClick: () => useClaudeStore.getState().clearContext(),
              },
            ],
            [
              {
                id: 'done-mode',
                icon: <DoneModeIcon mode={doneMode} />,
                title: 'When Done',
                active: doneModeMenu !== null,
                disabled: !projectRoot || !hasClaudeSession,
                onClick: (e: MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  setDoneModeMenu((open) => (open ? null : rect))
                },
              },
              {
                id: 'usage',
                icon: <UsageIcon />,
                title: 'Usage',
                active: usageOpen,
                disabled: !projectRoot || !activeSession || isTerminalKind(activeSession.kind),
                onClick: () => useClaudeStore.getState().usage(),
              },
              {
                id: 'cost',
                icon: <CostIcon />,
                title: 'Cost',
                active: costOpen,
                disabled: !projectRoot || !activeSession || isTerminalKind(activeSession.kind),
                onClick: () => useClaudeStore.getState().cost(),
              },
              {
                id: 'usage-graph',
                icon: <UsageGraphIcon />,
                title: 'Usage Graph',
                active: activeTabPath === USAGE_GRAPH_TAB_PATH,
                disabled: !projectRoot,
                onClick: () => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false }),
              },
            ],
          ]}
        />
          )

          return mirrored ? (
            <>
              {claudeActivityBar}
              <Group id={MAIN_PANEL_GROUP_ID} orientation="horizontal" className="flex-1" onLayoutChanged={onMainLayoutChanged}>
                {chatPanel}
                {chatHandle}
                {centerPanel}
                {sidebarHandle}
                {sidebarPanel}
              </Group>
              {primaryActivityBar}
            </>
          ) : (
            <>
              {primaryActivityBar}
              <Group id={MAIN_PANEL_GROUP_ID} orientation="horizontal" className="flex-1" onLayoutChanged={onMainLayoutChanged}>
                {sidebarPanel}
                {sidebarHandle}
                {centerPanel}
                {chatHandle}
                {chatPanel}
              </Group>
              {claudeActivityBar}
            </>
          )
        })()}
      </div>
      <StatusBar />
      {commandPaletteOpen && projectRoot && (
        <CommandPalette projectRoot={projectRoot} onClose={() => useSearchStore.getState().closeCommandPalette()} />
      )}
      {actionPaletteOpen && (
        <ActionPalette onClose={() => useSearchStore.getState().closeActionPalette()} />
      )}
      {shortcutsOverlayOpen && <ShortcutsOverlay />}
      {recentProjectsPaletteOpen && (
        <RecentProjectsPalette onClose={() => useSearchStore.getState().closeRecentProjectsPalette()} />
      )}
      {branchPaletteOpen && selectedRepo && (
        <BranchPalette projectRoot={selectedRepo} onClose={() => useSearchStore.getState().closeBranchPalette()} />
      )}
      <GitPromptHost />
      <StoreHost />
      <AutocompleteLifecycle />
      <DiscardScratchPromptHost />
      {doneModeMenu && (
        <DoneModeMenu anchor={doneModeMenu} side={mirrored ? 'left' : 'right'} onClose={closeDoneModeMenu} />
      )}
      {newSessionMenu && (
        <NewSessionMenu
          anchor={newSessionMenu}
          side={mirrored ? 'left' : 'right'}
          options={agentOptions}
          onPick={(kind, rocky) => {
            if (!projectRoot) return
            useClaudeStore.getState().newSession(projectRoot, kind, rocky)
            useClaudeStore.getState().setChatVisible(true)
          }}
          onPickScript={(script) => {
            if (projectRoot) runScriptInAgentTerminal(script, projectRoot)
          }}
          onClose={closeNewSessionMenu}
        />
      )}
      {sessionMenu && (
        <ClaudeSessionContextMenu
          x={sessionMenu.x}
          y={sessionMenu.y}
          onRename={() => {
            // Inline rename only renders in the wide bar — expand it first.
            // (Hover mode keeps the bar wide on its own while renaming.)
            if (!agentBarHover && useClaudeStore.getState().agentBarCollapsed) useClaudeStore.getState().toggleAgentBarCollapsed()
            setRenamingInstanceId(sessionMenu.instanceId)
          }}
          kind={sessionMenu.kind}
          onContinuePreviousSession={() => {
            if (!projectRoot) return
            useClaudeStore.getState().setActiveInstance(sessionMenu.instanceId)
            useClaudeStore.getState().setChatVisible(true)
            useClaudeStore.getState().previousSession(projectRoot)
          }}
          onResumeSession={() => {
            if (!projectRoot) return
            useClaudeStore.getState().setActiveInstance(sessionMenu.instanceId)
            useClaudeStore.getState().setChatVisible(true)
            useClaudeStore.getState().resumeSession(projectRoot)
          }}
          onRestorePrevious={() => {
            useClaudeStore.getState().setActiveInstance(sessionMenu.instanceId)
            useClaudeStore.getState().setChatVisible(true)
            useBridgeStore.getState().restorePrevious(sessionMenu.instanceId)
          }}
          onCompact={() => {
            useClaudeStore.getState().setActiveInstance(sessionMenu.instanceId)
            useClaudeStore.getState().setChatVisible(true)
            useClaudeStore.getState().compact()
          }}
          onClear={() => {
            useClaudeStore.getState().setActiveInstance(sessionMenu.instanceId)
            useClaudeStore.getState().setChatVisible(true)
            useClaudeStore.getState().clearContext()
          }}
          onCloseSession={() => {
            if (projectRoot) useClaudeStore.getState().closeInstance(projectRoot, sessionMenu.instanceId)
          }}
          onCloseAllSessions={() => {
            if (projectRoot) useClaudeStore.getState().closeAllInstances(projectRoot)
          }}
          onCloseOtherSessions={instances.length > 1 ? () => {
            if (projectRoot) useClaudeStore.getState().closeOtherInstances(projectRoot, sessionMenu.instanceId)
          } : undefined}
          onClose={() => setSessionMenu(null)}
        />
      )}
      <SetupWizard />
    </div>
  )
}

function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1)
}

type SystemUsage = {
  usedBytes: number
  totalBytes: number
  appBytes: number
  swapUsedBytes: number
  compressedBytes: number
  pressure: 'normal' | 'warn' | 'critical'
}

function MemoryPill({ usage }: { usage: SystemUsage }) {
  const [hovered, setHovered] = useState(false)
  const llamaEnabled = useLlamaSettingsStore((s) => s.enabled)
  // Fetched lazily on hover (potentially slow).
  // undefined = not yet fetched, null = nothing running / hide row.
  const [llamaBytes, setLlamaBytes] = useState<number | null | undefined>(undefined)
  // What vIDE itself runs, split by session — refreshed only while the panel
  // is open, and kept after it closes so reopening shows it straight away.
  const [breakdown, setBreakdown] = useState<MemoryBreakdown | null>(null)
  const instances = useClaudeStore((s) => s.instances)

  useEffect(() => {
    if (!hovered) return
    const poll = () => { window.api.getMemoryBreakdown().then(setBreakdown).catch(() => {}) }
    poll()
    const interval = setInterval(poll, MEMORY_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [hovered])

  const ownHues = Object.fromEntries(instances.map((inst) => [inst.id, inst.hue]))
  const { totalBytes: videBytes, rows: videRows } = memoryRows(
    breakdown ?? { appBytes: usage.appBytes, sessions: [], terminalsBytes: 0, languageServersBytes: 0, autocompleteBytes: 0, otherBytes: 0 },
    ownHues
  )

  function handleEnter() {
    setHovered(true)
    if (llamaEnabled && llamaBytes === undefined) {
      window.api.llamaGetMemoryUsage().then(setLlamaBytes).catch(() => setLlamaBytes(null))
    }
  }

  // Option C: the pill leads with memory pressure — colored, with a fill bar —
  // and the used/total number trails. Swap and compressed surface on hover.
  const usedFraction = usage.totalBytes > 0 ? usage.usedBytes / usage.totalBytes : 0
  const pressureClass =
    usage.pressure === 'critical' ? 'text-red-500' : usage.pressure === 'warn' ? 'text-amber-500' : 'text-fg-muted'
  const pressureLabel =
    usage.pressure === 'critical' ? 'Critical' : usage.pressure === 'warn' ? 'Warn' : 'Normal'

  return (
    <span
      className={`relative flex items-center gap-1.5 text-xs font-medium tabular-nums ${pressureClass}`}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <RamIcon />
      <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-current" style={{ width: `${Math.min(100, Math.max(4, usedFraction * 100))}%` }} />
      </span>
      {formatGb(usage.usedBytes)}/{formatGb(usage.totalBytes)} GB
      {hovered && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-md border border-border bg-popover p-2.5 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-fg-muted">System</span>
            <span className="font-medium text-fg tabular-nums">{formatGb(usage.usedBytes)}/{formatGb(usage.totalBytes)} GB</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-fg-muted">Pressure</span>
            <span className={`font-medium tabular-nums ${pressureClass}`}>{pressureLabel} · {Math.round(usedFraction * 100)}%</span>
          </div>
          {usage.swapUsedBytes > 0 && (
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">Swap</span>
              <span className="font-medium text-fg tabular-nums">{formatMemory(usage.swapUsedBytes)}</span>
            </div>
          )}
          {usage.compressedBytes > 0 && (
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">Compressed</span>
              <span className="font-medium text-fg tabular-nums">{formatMemory(usage.compressedBytes)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
            <span className="text-fg">vIDE total</span>
            <span className="font-medium text-fg tabular-nums">{formatMemory(videBytes)}</span>
          </div>
          {videRows.map((row) => (
            <div key={row.key} className="mt-1.5 flex items-center justify-between gap-3 pl-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: row.hue }} />
                <span className="truncate" title={row.label}>{row.label}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-fg tabular-nums">{formatMemory(row.bytes)}</span>
            </div>
          ))}
          {llamaEnabled && llamaBytes != null && (
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">Llama</span>
              <span className="font-medium text-fg tabular-nums">{formatGb(llamaBytes)} GB</span>
            </div>
          )}
        </div>
      )}
    </span>
  )
}

function RamIcon() {
  return (
    <svg
      className="shrink-0"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="7" width="18" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 7V4.5M11 7V4.5M13 7V4.5M17 7V4.5M7 17V19.5M11 17V19.5M13 17V19.5M17 17V19.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

