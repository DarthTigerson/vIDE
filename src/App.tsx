import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { ImperativePanelHandle, Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { clampSize, loadPanelSize } from '@/lib/panelSize'
import { syncOpenTabsFromDisk } from '@/lib/syncOpenTabsFromDisk'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Editor } from './components/Editor/Editor'
import { ActionPalette } from './components/Search/ActionPalette'
import { UpdateChangelogModal } from './components/UpdateChangelogModal'
import { SetupWizard } from './components/Onboarding/SetupWizard'
import { ShortcutsOverlay } from './components/Shortcuts/ShortcutsOverlay'
import { useHoldToShowShortcuts } from './components/Shortcuts/useHoldToShowShortcuts'
import { Chat } from './components/Chat/Chat'
import { openUrlInBrowserTab } from './components/Chat/terminalLinks'
import {
  ActivityBar,
  FilesIcon,
  GitIcon,
  DockerIcon,
  TodoIcon,
  JiraIcon,
  PhoneIcon,
  GraphIcon,
  SettingsIcon,
  TerminalIcon,
  BrowserIcon,
  ClaudeIcon,
  CodexIcon,
  BridgeIcon,
  NewSessionIcon,
  PreviousSessionIcon,
  CompactIcon,
  ClearIcon,
  UsageIcon,
  UsageGraphIcon,
  ModelIcon,
  FastIcon,
  NotesIcon,
} from './components/ActivityBar/ActivityBar'
import { ClaudeStatusIcon } from './components/ActivityBar/ClaudeStatusIcon'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { GitPanel } from './components/Git/GitPanel'
import { BranchPalette } from './components/Git/BranchPalette'
import { DockerPanel } from './components/Docker/DockerPanel'
import { MobileDisplayPanel } from './components/MobileDisplay/MobileDisplayPanel'
import { GraphifyPanel } from './components/Graphify/GraphifyPanel'
import { StatusBar } from './components/StatusBar/StatusBar'
import { EasterEgg } from './components/EasterEgg'
import { CommandPalette } from './components/Search/CommandPalette'
import { RecentProjectsPalette } from './components/Search/RecentProjectsPalette'
import { SearchModal } from './components/Search/SearchModal'
import { useFileStore } from './stores/fileStore'
import { useClaudeStore } from './stores/claudeStore'
import { useBridgeStore } from './stores/bridgeStore'
import { useBridgeSettingsStore } from './stores/bridgeSettingsStore'
import { useModelSettingsStore } from './stores/modelSettingsStore'
import { useGitStore, useRepoGitState } from './stores/gitStore'
import { useTodoStore } from './stores/todoStore'
import { useGitReposStore } from './stores/gitReposStore'
import { useGitSettingsStore } from './stores/gitSettingsStore'
import { useMobileStore } from './stores/mobileStore'
import { useThemeStore } from './stores/themeStore'
import { useDisplayStore } from './stores/displayStore'
import { EMPTY_EDITOR_BACKGROUNDS } from './assets/emptyEditorBackgrounds'
import { useEditorStore } from './stores/editorStore'
import { useSearchStore } from './stores/searchStore'
import { useFontSizeStore } from './stores/fontSizeStore'
import { useInstanceFontSizeStore } from './stores/instanceFontSizeStore'
import { useSidebarUiStore } from './stores/sidebarUiStore'
import { useUpdateStore } from './stores/updateStore'
import { useUsageAlertStore } from './stores/usageAlertStore'
import { useChangelogStore } from './stores/changelogStore'
import { useOnboardingStore } from './stores/onboardingStore'
import { useBrowserStore } from './stores/browserStore'
import { useJiraSettingsStore } from './stores/jiraSettingsStore'
import { useGitRemoteSettingsStore } from './stores/gitRemoteSettingsStore'
import { useDockerSettingsStore } from './stores/dockerSettingsStore'
import { useTodoSettingsStore } from './stores/todoSettingsStore'
import { useNotesSettingsStore } from './stores/notesSettingsStore'
import { useNotesStore } from './stores/notesStore'
import { detectGitRemoteProvider, gitRemoteIcon, gitRemoteLabel } from './lib/gitRemoteProvider'
import { evaluateCmdWForPinnedTab, type PendingClose } from './lib/pinnedTabCloseGuard'
import { buildTerminalPath, buildBrowserPath, JIRA_SETTINGS_TAB_PATH, GIT_SETTINGS_TAB_PATH, USAGE_GRAPH_TAB_PATH } from './components/Settings/paths'
import { TodoPanel } from './components/Todo/TodoPanel'
import { NotesPanel } from './components/Notes/NotesPanel'
import type { AssistantKind } from './types/api'

const ASSISTANT_OPTIONS: Array<{ id: AssistantKind; label: string }> = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'bridge', label: 'Bridge' },
]

function assistantIcon(kind: AssistantKind) {
  return kind === 'claude' ? <ClaudeIcon /> : kind === 'codex' ? <CodexIcon /> : <BridgeIcon />
}

const JIRA_BROWSER_ID = 'jira-external'
const GIT_REMOTE_BROWSER_ID = 'git-remote-external'
const GIT_POLL_INTERVAL_MS = 3000
const MEMORY_POLL_INTERVAL_MS = 3000

const SIDEBAR_SIZE_KEY = 'vide:layout:sidebarSize'
const SIDEBAR_DEFAULT_SIZE = 26
const SIDEBAR_MIN_SIZE = 4
const SIDEBAR_MAX_SIZE = 40
const CHAT_SIZE_KEY = 'vide:layout:chatSize'
const CHAT_DEFAULT_SIZE = 25
const CHAT_MIN_SIZE = 15
const CHAT_MAX_SIZE = 50

function loadSidebarSize(): number {
  return loadPanelSize(SIDEBAR_SIZE_KEY, SIDEBAR_DEFAULT_SIZE, SIDEBAR_MIN_SIZE, SIDEBAR_MAX_SIZE)
}

function loadChatSize(): number {
  return loadPanelSize(CHAT_SIZE_KEY, CHAT_DEFAULT_SIZE, CHAT_MIN_SIZE, CHAT_MAX_SIZE)
}

export default function App() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const gitStatus = useRepoGitState(selectedRepo).status
  const refreshGitStatus = useGitStore((s) => s.refreshStatus)
  const assistant = useClaudeStore((s) => s.assistant)
  const usageOpen = useClaudeStore((s) => s.usageOpen)
  const setAssistant = useClaudeStore((s) => s.setAssistant)
  const chatVisible = useClaudeStore((s) => s.chatVisible)
  const enabledModels = useModelSettingsStore((s) => s.enabled)
  const visibleAssistantOptions = ASSISTANT_OPTIONS.filter((option) => enabledModels[option.id])
  const repoName = projectRoot ? projectRoot.split('/').pop() : null
  const [leftPanel, setLeftPanel] = useState<'files' | 'git' | 'docker' | 'mobile' | 'graphify' | 'todos' | 'notes' | 'settings' | null>('files')
  const lastLeftPanelRef = useRef<'files' | 'git' | 'docker' | 'mobile' | 'graphify' | 'todos' | 'notes' | 'settings'>('files')
  const [sidebarSize, setSidebarSize] = useState(loadSidebarSize)
  const [chatSize, setChatSize] = useState(loadChatSize)
  const [assistantMenuOpen, setAssistantMenuOpen] = useState(false)
  const [memoryUsage, setMemoryUsage] = useState<{ usedBytes: number; totalBytes: number } | null>(null)
  const commandPaletteOpen = useSearchStore((s) => s.commandPaletteOpen)
  const searchOpen = useSearchStore((s) => s.searchOpen)
  const actionPaletteOpen = useSearchStore((s) => s.actionPaletteOpen)
  const shortcutsOverlayOpen = useSearchStore((s) => s.shortcutsOverlayOpen)
  const recentProjectsPaletteOpen = useSearchStore((s) => s.recentProjectsPaletteOpen)
  const branchPaletteOpen = useSearchStore((s) => s.branchPaletteOpen)
  const chatPanelRef = useRef<ImperativePanelHandle>(null)
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const assistantLabel = assistant === 'claude' ? 'Claude Code' : assistant === 'codex' ? 'Codex' : 'Bridge'
  const newSessionTitle = assistant === 'claude' ? 'New Claude Session' : assistant === 'codex' ? 'New Codex Session' : 'New Bridge Session'
  const previousSessionTitle = assistant === 'claude' ? 'Continue Claude Session' : assistant === 'codex' ? 'Resume Latest Codex Session' : 'Restore Previous Bridge Session'
  const uncommittedChangeCount = new Set([
    ...gitStatus.staged.map((file) => file.path),
    ...gitStatus.unstaged.map((file) => file.path),
  ]).size
  const gitBadge = uncommittedChangeCount > 99 ? '99+' : uncommittedChangeCount || undefined
  const mobileState = useMobileStore((s) => s.state)
  const mobileBadge = mobileState.running && mobileState.connectedCount > 0 ? mobileState.connectedCount : undefined
  const theme = useThemeStore((s) => s.theme)
  const font = useDisplayStore((s) => s.font)
  const memoryUsageVisible = useDisplayStore((s) => s.memoryUsageVisible)
  const backgroundImage = useDisplayStore((s) => s.backgroundImage)
  const navbarPosition = useDisplayStore((s) => s.navbarPosition)
  const mirrored = navbarPosition === 'right'
  const periodicFetchEnabled = useGitSettingsStore((s) => s.periodicFetchEnabled)
  const periodicFetchIntervalMinutes = useGitSettingsStore((s) => s.periodicFetchIntervalMinutes)
  const activeTabPath = useEditorStore((s) => s.activeTabPath)
  const jiraEnabled = useJiraSettingsStore((s) => s.enabled)
  // Re-derives whenever externalUrl or projectUrls changes, since getEffectiveUrl
  // itself isn't reactive state — subscribing to those two directly (rather than
  // to a derived value computed inside the selector) keeps this correct.
  useJiraSettingsStore((s) => s.externalUrl)
  useJiraSettingsStore((s) => s.projectUrls)
  const jiraUrl = useJiraSettingsStore.getState().getEffectiveUrl(projectRoot)
  const jiraReady = jiraEnabled && jiraUrl.trim() !== ''
  useGitRemoteSettingsStore((s) => s.externalUrl)
  useGitRemoteSettingsStore((s) => s.projectUrls)
  const gitRemoteUrl = useGitRemoteSettingsStore.getState().getEffectiveUrl(projectRoot)
  const gitRemoteReady = gitRemoteUrl.trim() !== ''
  const gitRemoteProvider = detectGitRemoteProvider(gitRemoteUrl)
  const dockerEnabled = useDockerSettingsStore((s) => s.enabled)
  const todoEnabled = useTodoSettingsStore((s) => s.enabled)
  const notesEnabled = useNotesSettingsStore((s) => s.enabled)

  function openNewTerminal() {
    const id = Date.now().toString(36)
    useEditorStore.getState().openTab({ path: buildTerminalPath(id), content: '', dirty: false })
  }

  function openNewBrowser() {
    const id = Date.now().toString(36)
    useEditorStore.getState().openTab({ path: buildBrowserPath(id), content: '', dirty: false })
  }

  // Mirrors the git-remote/Jira external-link pattern below — same
  // fixed-tab-id, empty-URL-falls-back-to-settings, closeSidePanelOnOpen
  // behavior.
  function openJira() {
    const url = useJiraSettingsStore.getState().getEffectiveUrl(projectRoot)
    if (!url) {
      useEditorStore.getState().openTab({ path: JIRA_SETTINGS_TAB_PATH, content: '', dirty: false })
      return
    }
    useBrowserStore.getState().ensureTab(JIRA_BROWSER_ID, url)
    useEditorStore.getState().openTab({ path: buildBrowserPath(JIRA_BROWSER_ID), content: '', dirty: false })
    if (useJiraSettingsStore.getState().closeSidePanelOnOpen) setLeftPanel(null)
  }

  // Mirrors openJira() above. Its Settings config lives inside the Git
  // settings page (a dedicated section) rather than its own tab, so the
  // empty-URL fallback opens that instead of a page of its own.
  function openGitRemote() {
    const url = useGitRemoteSettingsStore.getState().getEffectiveUrl(projectRoot)
    if (!url) {
      useEditorStore.getState().openTab({ path: GIT_SETTINGS_TAB_PATH, content: '', dirty: false })
      return
    }
    useBrowserStore.getState().ensureTab(GIT_REMOTE_BROWSER_ID, url)
    useEditorStore.getState().openTab({ path: buildBrowserPath(GIT_REMOTE_BROWSER_ID), content: '', dirty: false })
    if (useGitRemoteSettingsStore.getState().closeSidePanelOnOpen) setLeftPanel(null)
  }

  function saveSidebarSize(size: number) {
    const nextSize = clampSize(size, SIDEBAR_MIN_SIZE, SIDEBAR_MAX_SIZE)
    setSidebarSize(nextSize)
    localStorage.setItem(SIDEBAR_SIZE_KEY, String(nextSize))
  }

  function saveChatSize(size: number) {
    const nextSize = clampSize(size, CHAT_MIN_SIZE, CHAT_MAX_SIZE)
    setChatSize(nextSize)
    localStorage.setItem(CHAT_SIZE_KEY, String(nextSize))
  }

  useEffect(() => {
    useBridgeSettingsStore.getState().init()
    useMobileStore.getState().init()
    useNotesStore.getState().loadRoot()
  }, [])

  useEffect(() => {
    window.api.mobileSetDisplay(theme, font)
  }, [theme, font])

  useEffect(() => {
    if (!assistantMenuOpen) return

    const close = () => setAssistantMenuOpen(false)
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAssistantMenuOpen(false)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [assistantMenuOpen])

  useEffect(() => {
    if (chatVisible) chatPanelRef.current?.expand()
    else chatPanelRef.current?.collapse()
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

  // Git/Docker/Mobile Display/Graphify only make sense with a project open
  // (their ActivityBar icons disappear entirely when projectRoot is null,
  // see primaryActivityBar below) — fall back to Explorer so a project
  // closing mid-session doesn't strand the sidebar (or a later Cmd+B
  // reopen, which restores lastLeftPanelRef) on a now-icon-less panel.
  useEffect(() => {
    if (projectRoot) return
    const isProjectOnly = (p: typeof leftPanel) =>
      p === 'git' || p === 'docker' || p === 'mobile' || p === 'graphify'
    if (isProjectOnly(lastLeftPanelRef.current)) lastLeftPanelRef.current = 'files'
    setLeftPanel((p) => (isProjectOnly(p) ? 'files' : p))
  }, [projectRoot])

  // Mirrors the chat panel above: driven imperatively rather than
  // conditionally unmounted (see the sidebar Panel's own comment for why —
  // unmounting it here would re-trigger the exact desync this pattern
  // exists to avoid).
  useEffect(() => {
    if (leftPanel !== null) sidebarPanelRef.current?.expand()
    else sidebarPanelRef.current?.collapse()
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

  useEffect(() => {
    if (enabledModels[assistant]) return
    const fallback = ASSISTANT_OPTIONS.find((option) => enabledModels[option.id])
    if (fallback) setAssistant(fallback.id)
  }, [enabledModels, assistant, setAssistant])

  useEffect(() => {
    // Pull (not push): ask main whether this window was opened with a
    // specific initial project (New Window / Recent Projects) and await the
    // answer before deciding whether to fall back to restoreRoot() (the
    // shared localStorage last-project, used by the app-launch window). This
    // is deterministic — unlike the old push-based listener, which could
    // never actually observe an IPC message arriving before the very next
    // synchronous line ran — and reload-safe, since the main-process side is
    // one-shot per window and returns null on a later call.
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
    return window.api.onAssistantBusy((assistant, busy) => {
      useClaudeStore.getState().setBusy(assistant, busy)
    })
  }, [])

  useEffect(() => {
    // Catches file changes made outside the app's own UI — Finder, an
    // external editor, a build script, `mkdir`/`touch` in a terminal, an
    // agent (Claude/Codex/Bridge) editing files directly — which the app's
    // own create/rename/delete actions already refresh for, but nothing else
    // does. Also refreshes the Git Panel's staged/unstaged list: a content
    // edit only touches the working tree, never `.git/*`, so GitWatcher's
    // metadata-only watch never sees it — this is the only path that does.
    // Same reasoning applies to any open editor tab for that file: without
    // this, the tab shows stale content until closed and reopened, and
    // autosave will happily write that stale content back over the change.
    return window.api.onFsChanged((cwd) => {
      if (cwd === useFileStore.getState().projectRoot) {
        useFileStore.getState().refreshTree()
        useGitStore.getState().refreshStatus(cwd)
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

  const pendingPinnedCloseRef = useRef<PendingClose | null>(null)
  useEffect(() => {
    return window.api.onMenuCloseActiveTab(() => {
      const { activePaneId, paneTabs, pinnedPaths, closeActiveTab } = useEditorStore.getState()
      const path = paneTabs[activePaneId]
      if (!path) return
      const { shouldClose, nextPending } = evaluateCmdWForPinnedTab(
        path,
        pinnedPaths.has(path),
        pendingPinnedCloseRef.current,
        Date.now()
      )
      pendingPinnedCloseRef.current = nextPending
      if (shouldClose) closeActiveTab()
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
    return window.api.onMenuNewFile(() => {
      setLeftPanel('files')
      useSidebarUiStore.getState().requestCreate('file')
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
    return window.api.onMenuReopenClosedTab(() => {
      useEditorStore.getState().reopenLastClosed()
    })
  }, [])

  useEffect(() => {
    // Cmd+F itself reaches Monaco's own find widget directly (nothing
    // intercepts the keystroke anymore) - this only backs the Edit menu's
    // "Find" item for a mouse click, mirroring that same native behavior on
    // whichever editor currently has focus.
    return window.api.onMenuFind(() => {
      const editor = monaco.editor.getEditors().find((e) => e.hasTextFocus())
      editor?.getAction('actions.find')?.run()
    })
  }, [])

  useEffect(() => {
    return window.api.onMenuFindInFiles(() => {
      if (!useFileStore.getState().projectRoot) return
      useSearchStore.getState().openSearch()
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
          style={{ backgroundImage: `url(${EMPTY_EDITOR_BACKGROUNDS[backgroundImage]})` }}
          aria-hidden="true"
        />
      )}
      <EasterEgg />
      <div
        className="relative z-50 h-8 shrink-0 flex items-center justify-center bg-tab-bar border-b border-border"
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
          <button
            type="button"
            onClick={() => setAssistantMenuOpen((open) => !open)}
            aria-label="Assistant"
            aria-expanded={assistantMenuOpen}
            className="flex h-6 min-w-[126px] items-center justify-between gap-2 rounded border border-border bg-panel px-2 text-xs font-medium text-fg outline-none transition-colors hover:border-fg-subtle focus:border-accent"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-fg-muted">
                {assistantIcon(assistant)}
              </span>
              {assistantLabel}
            </span>
            <ChevronDownIcon open={assistantMenuOpen} />
          </button>
          {assistantMenuOpen && (
            <div className="fixed right-3 top-9 z-[100] w-40 rounded border border-border bg-sidebar p-1 shadow-2xl shadow-black/50">
              {visibleAssistantOptions.map((option) => {
                const selected = option.id === assistant
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setAssistant(option.id)
                      setAssistantMenuOpen(false)
                    }}
                    className={[
                      'flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition-colors',
                      selected
                        ? 'bg-accent/20 text-fg'
                        : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                    ].join(' ')}
                  >
                    <span className={selected ? 'text-fg' : 'text-fg-subtle'}>
                      {assistantIcon(option.id)}
                    </span>
                    <span className="flex-1">{option.label}</span>
                    {selected && <CheckIcon />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {(() => {
          const primaryActivityBar = (
        <ActivityBar
          side={mirrored ? 'right' : 'left'}
          groups={[[
            {
              id: 'files',
              icon: <FilesIcon />,
              title: 'Explorer',
              active: leftPanel === 'files',
              onClick: () => setLeftPanel((p) => (p === 'files' ? null : 'files')),
            },
            ...(projectRoot ? [{
              id: 'git',
              icon: <GitIcon />,
              title: 'Git',
              active: leftPanel === 'git',
              badge: gitBadge,
              onClick: () => setLeftPanel((p) => (p === 'git' ? null : 'git')),
            }] : []),
            ...(dockerEnabled && projectRoot ? [{
              id: 'docker',
              icon: <DockerIcon />,
              title: 'Docker',
              active: leftPanel === 'docker',
              onClick: () => setLeftPanel((p) => (p === 'docker' ? null : 'docker')),
            }] : []),
            ...(projectRoot ? [{
              id: 'mobile',
              icon: <PhoneIcon />,
              title: 'Mobile Display',
              active: leftPanel === 'mobile',
              badge: mobileBadge,
              onClick: () => setLeftPanel((p) => (p === 'mobile' ? null : 'mobile')),
            }] : []),
            ...(projectRoot ? [{
              id: 'graphify',
              icon: <GraphIcon />,
              title: 'Graphify',
              active: leftPanel === 'graphify',
              onClick: () => setLeftPanel((p) => (p === 'graphify' ? null : 'graphify')),
            }] : []),
            ...(todoEnabled ? [{
              id: 'todos',
              icon: <TodoIcon />,
              title: 'To Do',
              active: leftPanel === 'todos',
              onClick: () => setLeftPanel((p) => (p === 'todos' ? null : 'todos')),
            }] : []),
            ...(notesEnabled ? [{
              id: 'notes',
              icon: <NotesIcon />,
              title: 'Notes',
              active: leftPanel === 'notes',
              onClick: () => setLeftPanel((p) => (p === 'notes' ? null : 'notes')),
            }] : []),
          ], ...(gitRemoteReady || jiraReady ? [[
            ...(gitRemoteReady ? [{
              id: 'git-remote',
              icon: gitRemoteIcon(gitRemoteProvider),
              title: gitRemoteLabel(gitRemoteProvider),
              active: activeTabPath === buildBrowserPath(GIT_REMOTE_BROWSER_ID),
              onClick: openGitRemote,
            }] : []),
            ...(jiraReady ? [{
              id: 'jira',
              icon: <JiraIcon />,
              title: 'Jira',
              active: activeTabPath === buildBrowserPath(JIRA_BROWSER_ID),
              onClick: openJira,
            }] : []),
          ]] : [])]}
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
            ref={sidebarPanelRef}
            defaultSize={sidebarSize}
            minSize={SIDEBAR_MIN_SIZE}
            maxSize={SIDEBAR_MAX_SIZE}
            collapsible
            collapsedSize={0}
            onCollapse={() => setLeftPanel(null)}
            id="sidebar"
            order={mirrored ? 3 : 1}
            onResize={saveSidebarSize}
          >
            {(() => {
              const activeLeftPanel = leftPanel ?? lastLeftPanelRef.current
              return activeLeftPanel === 'files' ? <Sidebar /> : activeLeftPanel === 'git' ? <GitPanel /> : activeLeftPanel === 'docker' ? <DockerPanel /> : activeLeftPanel === 'mobile' ? <MobileDisplayPanel /> : activeLeftPanel === 'graphify' ? <GraphifyPanel /> : activeLeftPanel === 'todos' ? <TodoPanel /> : activeLeftPanel === 'notes' ? <NotesPanel /> : <SettingsPanel />
            })()}
          </Panel>
          )
          const sidebarHandle = (
          <PanelResizeHandle key="sidebar-handle" className={`w-px bg-border hover:bg-accent/60 transition-colors cursor-col-resize ${leftPanel ? '' : 'hidden'}`} />
          )

          const centerPanel = (
          <Panel key="center" id="center" order={2}>
            <Editor />
          </Panel>
          )

          const chatHandle = (
          <PanelResizeHandle key="chat-handle" className={`w-px bg-border hover:bg-accent/60 transition-colors cursor-col-resize ${chatVisible ? '' : 'hidden'}`} />
          )
          const chatPanel = (
          <Panel
            key="chat"
            ref={chatPanelRef}
            defaultSize={chatSize}
            minSize={CHAT_MIN_SIZE}
            maxSize={CHAT_MAX_SIZE}
            collapsible
            id="chat"
            order={mirrored ? 1 : 3}
            onResize={saveChatSize}
          >
            <Chat />
          </Panel>
          )

          const claudeActivityBar = projectRoot && (
        <ActivityBar
          side={mirrored ? 'left' : 'right'}
          showAccent={false}
          dense
          groups={[
            [{
              id: assistant,
              icon: assistant === 'claude' ? <ClaudeStatusIcon /> : assistantIcon(assistant),
              title: assistantLabel,
              active: chatVisible,
              disabled: !projectRoot,
              onClick: () => useClaudeStore.getState().toggleChatVisible(),
            }],
            [
              {
                id: 'new-session',
                icon: <NewSessionIcon />,
                title: newSessionTitle,
                active: false,
                disabled: !projectRoot,
                onClick: () => {
                  if (!projectRoot) return
                  if (assistant === 'bridge') useBridgeStore.getState().newSession()
                  else useClaudeStore.getState().newSession(projectRoot)
                },
              },
              {
                id: 'previous-session',
                icon: <PreviousSessionIcon />,
                title: previousSessionTitle,
                active: false,
                disabled: !projectRoot,
                onClick: () => {
                  if (!projectRoot) return
                  if (assistant === 'bridge') useBridgeStore.getState().openSessionPicker()
                  else useClaudeStore.getState().previousSession(projectRoot)
                },
              },
            ],
            ...(assistant === 'claude' ? [[
              {
                id: 'compact',
                icon: <CompactIcon />,
                title: 'Compact',
                active: false,
                disabled: !projectRoot,
                onClick: () => useClaudeStore.getState().compact(),
              },
              {
                id: 'clear',
                icon: <ClearIcon />,
                title: 'Clear',
                active: false,
                disabled: !projectRoot,
                onClick: () => useClaudeStore.getState().clearContext(),
              },
            ]] : []),
          ]}
          bottomGroups={assistant === 'claude'
            ? [[
              {
                id: 'usage',
                icon: <UsageIcon />,
                title: 'Usage',
                active: usageOpen,
                disabled: !projectRoot,
                onClick: () => useClaudeStore.getState().usage(),
              },
              {
                id: 'usage-graph',
                icon: <UsageGraphIcon />,
                title: 'Usage Graph',
                active: activeTabPath === USAGE_GRAPH_TAB_PATH,
                disabled: !projectRoot,
                onClick: () => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false }),
              },
            ]]
            : assistant === 'codex'
            ? [[
              {
                id: 'model',
                icon: <ModelIcon />,
                title: 'Model',
                active: false,
                disabled: !projectRoot,
                onClick: () => useClaudeStore.getState().model(),
              },
              {
                id: 'fast',
                icon: <FastIcon />,
                title: 'Fast',
                active: false,
                disabled: !projectRoot,
                onClick: () => useClaudeStore.getState().fast(),
              },
            ]]
            : []}
        />
          )

          return mirrored ? (
            <>
              {claudeActivityBar}
              <PanelGroup direction="horizontal" className="flex-1">
                {chatPanel}
                {chatHandle}
                {centerPanel}
                {sidebarHandle}
                {sidebarPanel}
              </PanelGroup>
              {primaryActivityBar}
            </>
          ) : (
            <>
              {primaryActivityBar}
              <PanelGroup direction="horizontal" className="flex-1">
                {sidebarPanel}
                {sidebarHandle}
                {centerPanel}
                {chatHandle}
                {chatPanel}
              </PanelGroup>
              {claudeActivityBar}
            </>
          )
        })()}
      </div>
      <StatusBar />
      {commandPaletteOpen && projectRoot && (
        <CommandPalette projectRoot={projectRoot} onClose={() => useSearchStore.getState().closeCommandPalette()} />
      )}
      {searchOpen && projectRoot && (
        <SearchModal
          projectRoot={projectRoot}
          onClose={() => useSearchStore.getState().closeSearch()}
        />
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
      <UpdateChangelogModal />
      <SetupWizard />
    </div>
  )
}

function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1)
}

function MemoryPill({ usage }: { usage: { usedBytes: number; totalBytes: number } }) {
  return (
    <span
      className="flex items-center gap-1 text-xs font-medium text-fg-muted tabular-nums"
      title="System memory used / total"
    >
      <RamIcon />
      {formatGb(usage.usedBytes)}/{formatGb(usage.totalBytes)} GB
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

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={['shrink-0 transition-transform', open ? 'rotate-180' : ''].join(' ')}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      className="shrink-0 text-accent"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 12.5L10 17.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
