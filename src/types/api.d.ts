import type { FileNode, GitStatus, GitCommitResult, GitDiffContent, GitAheadBehind, GitCommandAction, GitCommandPayload, GitBranchList, GitCommit, GitBranchDiff, SearchMatch } from './index'
import type { BrowserViewEvent } from '../../electron/browserViews'
import type { InlineEditStartPayload, InlineEditEvent } from '../../electron/inlineEdit'
import type { LatestUsage, UsageSnapshot } from '../../electron/usagePoller'
import type { UpdateInfo } from '../../electron/updateChecker'
import type { GraphifyGraph } from './graphify'
import type { DefinitionLocation, DetectResult, LspServerId } from '../../electron/lsp/types'
import type { DockerStatus, DockerContainer, DockerActionResult } from '../../electron/docker'
import type { OnboardingStatus, GitIdentity } from '../../electron/onboarding'

export type { LatestUsage, UsageSnapshot, UpdateInfo, DockerStatus, DockerContainer, DockerActionResult }

export type AssistantKind = 'claude' | 'codex' | 'bridge'

export interface SessionData {
  layout: unknown
  paneTabs: Record<string, string | null>
  paneTabLists: Record<string, string[]>
  activeTabPath: string | null
  activePaneId: string
  tabs: { path: string }[]
  browserUrls: Record<string, string>
}

export interface MobileNetworkInterface {
  name: string
  address: string
}

export interface MobileDevice {
  id: string
  label: string
  connectedAt: number
}

export interface MobileState {
  running: boolean
  port: number
  localIp: string
  pin: string
  qrSvg: string
  connectedCount: number
  allowingNewDevice: boolean
  interfaces: MobileNetworkInterface[]
  devices: MobileDevice[]
}

export type BridgeRole = 'system' | 'user' | 'assistant' | 'tool'

export interface BridgeToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface BridgeMessage {
  role: BridgeRole
  content: string | null
  tool_calls?: BridgeToolCall[]
  tool_call_id?: string
}

export interface BridgeSettings {
  endpoint: string
  apiKey: string
  modelId: string
}

export interface RecentProject {
  path: string
  lastOpened: number
}

export type TodoStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type TodoLabel = 'bug' | 'feature' | 'nice-to-have'
export type TodoAuthor = 'developer' | 'claude'

export interface TodoProject {
  id: string
  name: string
  key: string
  nextNumber: number
  createdAt: number
}

export interface TodoComment {
  id: string
  body: string
  attachments: string[]
  author: TodoAuthor
  createdAt: number
}

export interface Todo {
  id: string
  projectId: string
  title: string
  description: string
  attachments: string[]
  status: TodoStatus
  archived: boolean
  label: TodoLabel | null
  tags: string[]
  prUrl: string | null
  comments: TodoComment[]
  author: TodoAuthor
  createdAt: number
  updatedAt: number
}

export interface NotesEntryResult {
  path: string
  name: string
}

export interface NotesSearchResult {
  path: string
  name: string
  snippet: string | null
}

export interface TodoUpdatePatch {
  title?: string
  description?: string
  attachments?: string[]
  status?: TodoStatus
  label?: TodoLabel | null
  tags?: string[]
  prUrl?: string | null
}

export type BridgeEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'content-replace'; content: string }
  | { type: 'tool-call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'need-approval'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; id: string; result: string; isError: boolean }
  | { type: 'new-turn' }
  | { type: 'done' }
  | { type: 'error'; message: string }

declare global {
  interface Window {
    api: {
      readDir: (path: string) => Promise<FileNode[]>
      readFile: (path: string) => Promise<string>
      readImageDataUrl: (path: string) => Promise<string>
      pathExists: (path: string) => Promise<boolean>
      getHomeDir: () => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      mkdir: (path: string) => Promise<void>
      renamePath: (from: string, to: string) => Promise<void>
      trashPath: (path: string) => Promise<void>
      listAllFiles: (root: string) => Promise<string[]>
      searchText: (root: string, query: string, caseSensitive: boolean) => Promise<SearchMatch[]>
      openFolder: () => Promise<string | null>
      getSystemMemoryUsage: () => Promise<{ usedBytes: number; totalBytes: number }>
      fsWatchRoot: (cwd: string | null) => void
      onFsChanged: (cb: (cwd: string) => void) => () => void

      gitBranch: (cwd: string) => Promise<string | null>
      gitAheadBehind: (cwd: string) => Promise<GitAheadBehind | null>
      gitStatus: (cwd: string) => Promise<GitStatus>
      gitListIgnored: (cwd: string) => Promise<string[]>
      gitStage: (cwd: string, paths: string[]) => Promise<void>
      gitUnstage: (cwd: string, paths: string[]) => Promise<void>
      gitStageAll: (cwd: string) => Promise<void>
      gitUnstageAll: (cwd: string) => Promise<void>
      gitDiscard: (cwd: string, path: string) => Promise<void>
      gitDiscardAll: (cwd: string) => Promise<void>
      gitCommit: (cwd: string, message: string, noVerify?: boolean) => Promise<GitCommitResult>
      gitDiff: (cwd: string, path: string, staged: boolean) => Promise<GitDiffContent>
      gitFileAtHead: (cwd: string, path: string) => Promise<string>
      gitCommitDiff: (cwd: string, hash: string, path: string) => Promise<GitDiffContent>
      gitRunCommand: (id: string, cwd: string, action: GitCommandAction, payload?: GitCommandPayload) => Promise<void>
      onGitLogData: (cb: (id: string, data: string) => void) => () => void
      onGitLogExit: (cb: (id: string, code: number) => void) => () => void
      gitLogResize: (cols: number, rows: number) => void
      gitGraph: (cwd: string, offset?: number, limit?: number) => Promise<GitCommit[]>
      gitBranches: (cwd: string) => Promise<string[]>
      gitDefaultBranch: (cwd: string) => Promise<string | null>
      gitBranchList: (cwd: string) => Promise<GitBranchList>
      gitBranchDiff: (cwd: string, source: string, target: string, offset?: number, limit?: number) => Promise<GitBranchDiff>
      gitShowStat: (cwd: string, hash: string) => Promise<string[]>
      gitFetchSilent: (cwd: string) => Promise<boolean>
      gitStagedDiff: (cwd: string) => Promise<string>
      gitDiscoverRepos: (root: string, maxDepth?: number) => Promise<string[]>
      gitWatchRoot: (cwd: string | null) => void
      onGitChanged: (cb: (cwd: string) => void) => () => void

      dockerStatus: () => Promise<DockerStatus>
      dockerListContainers: () => Promise<DockerContainer[]>
      dockerStartContainer: (id: string) => Promise<DockerActionResult>
      dockerStopContainer: (id: string) => Promise<DockerActionResult>
      dockerRestartContainer: (id: string) => Promise<DockerActionResult>
      dockerRemoveContainer: (id: string) => Promise<DockerActionResult>
      dockerOpenApp: () => Promise<DockerActionResult>
      dockerRunLogs: (streamId: string, containerId: string) => Promise<void>
      dockerStopLogs: (streamId: string) => void
      onDockerLogData: (cb: (streamId: string, data: string) => void) => () => void
      onDockerLogExit: (cb: (streamId: string, code: number) => void) => () => void
      dockerWatch: () => void
      dockerUnwatch: () => void
      onDockerChanged: (cb: () => void) => () => void

      termSpawn: (id: string, cwd?: string) => Promise<void>
      termKill: (id: string) => Promise<void>
      termWrite: (id: string, data: string) => void
      termResize: (id: string, cols: number, rows: number) => void
      onTermData: (cb: (id: string, data: string) => void) => () => void
      onTermExit: (cb: (id: string) => void) => () => void

      assistantSpawn: (cwd: string, assistant: AssistantKind, mode?: 'new' | 'continue' | 'resume') => Promise<void>
      assistantWrite: (assistant: AssistantKind, data: string) => void
      assistantResize: (assistant: AssistantKind, cols: number, rows: number) => void
      onAssistantData: (cb: (assistant: AssistantKind, data: string) => void) => () => void
      onAssistantBusy: (cb: (assistant: AssistantKind, busy: boolean, chunkCount: number) => void) => () => void
      onBrowserOpenExternalUrl: (cb: (url: string) => void) => () => void
      onOpenClaudeBrowserTab: (cb: () => void) => () => void

      onMenuOpenProject: (cb: () => void) => () => void
      getInitialProject: () => Promise<string | null>
      onMenuCloseActiveTab: (cb: () => void) => () => void
      onMenuZoomIn: (cb: () => void) => () => void
      onMenuZoomOut: (cb: () => void) => () => void
      onMenuResetZoom: (cb: () => void) => () => void
      onMenuOpenSettings: (cb: () => void) => () => void
      onMenuNewFile: (cb: () => void) => () => void
      onMenuNewFolder: (cb: () => void) => () => void
      onMenuNewTerminal: (cb: () => void) => () => void
      onMenuReopenClosedTab: (cb: () => void) => () => void
      onMenuSave: (cb: () => void) => () => void
      onMenuFind: (cb: () => void) => () => void
      onMenuFindInFiles: (cb: () => void) => () => void
      onMenuToggleSidebar: (cb: () => void) => () => void
      onMenuCommandPalette: (cb: () => void) => () => void
      onMenuActionPalette: (cb: () => void) => () => void
      onMenuToggleClaudeChat: (cb: () => void) => () => void
      onMenuRecentProjectsPalette: (cb: () => void) => () => void
      openProjectInNewWindow: (path: string) => Promise<void>
      focusProjectIfOpen: (path: string) => Promise<boolean>

      mobileStart: () => Promise<void>
      mobileStop: () => Promise<void>
      mobileGetState: () => Promise<MobileState>
      mobileAddDevice: () => Promise<void>
      mobileSelectInterface: (address: string) => Promise<void>
      mobileDisconnectDevice: (id: string) => Promise<void>
      mobileDisconnectAll: () => Promise<void>
      mobileSetDisplay: (theme: string, font: string) => void
      onMobileState: (cb: (state: MobileState) => void) => () => void

      usageAcquire: () => Promise<void>
      usageRelease: () => Promise<void>
      usageGetLatest: () => Promise<LatestUsage | null>
      usageGetRange: (fromTs: number, toTs: number, maxPoints?: number) => Promise<UsageSnapshot[]>
      usageGetPassiveEnabled: () => Promise<boolean>
      usageSetPassiveEnabled: (enabled: boolean) => Promise<void>
      onUsageUpdate: (cb: (latest: LatestUsage | null) => void) => () => void

      updateGetLatest: () => Promise<UpdateInfo | null>
      updateRestart: () => void
      onUpdateAvailable: (cb: (info: UpdateInfo | null) => void) => () => void
      onUpdateUpToDate: (cb: (version: string) => void) => () => void
      getChangelogForVersion: (version: string) => Promise<string | null>

      bridgeSend: (cwd: string, messages: BridgeMessage[], agentMode: boolean, settings: BridgeSettings) => void
      bridgeApprove: (toolCallId: string) => void
      bridgeReject: (toolCallId: string) => void
      bridgeCancel: () => void
      bridgeTestConnection: (settings: BridgeSettings) => Promise<{ ok: boolean; error?: string }>
      bridgeGetSettings: () => Promise<BridgeSettings | null>
      bridgeSetSettings: (settings: BridgeSettings) => Promise<void>
      onBridgeEvent: (cb: (event: BridgeEvent) => void) => () => void

      devtoolsAttach: (targetId: number, hostId: number) => Promise<void>
      devtoolsDetach: (targetId: number) => Promise<void>

      browserViewCreate: (id: string, url: string) => Promise<number | null>
      browserViewSetBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      browserViewSetVisible: (id: string, visible: boolean) => Promise<void>
      browserViewNavigate: (id: string, url: string) => Promise<void>
      browserViewGoBack: (id: string) => Promise<void>
      browserViewGoForward: (id: string) => Promise<void>
      browserViewReload: (id: string) => Promise<void>
      browserViewZoomIn: (id: string) => Promise<void>
      browserViewZoomOut: (id: string) => Promise<void>
      browserViewZoomReset: (id: string) => Promise<void>
      browserViewSetMobileMode: (
        id: string,
        enabled: boolean,
        device?: { width: number; height: number; pixelRatio: number }
      ) => Promise<void>
      browserViewClearCache: (id: string) => Promise<void>
      browserViewDestroy: (id: string) => Promise<void>
      onBrowserViewEvent: (cb: (id: string, event: BrowserViewEvent) => void) => () => void

      sessionLoad: (projectRoot: string) => Promise<SessionData | null>
      sessionSave: (projectRoot: string, data: SessionData) => Promise<void>

      recentProjectsList: () => Promise<RecentProject[]>
      recentProjectsAdd: (path: string) => Promise<void>
      recentProjectsClear: () => Promise<void>

      todosListProjects: () => Promise<TodoProject[]>
      todosCreateProject: (name: string, key: string) => Promise<TodoProject>
      todosListTodos: (projectId: string) => Promise<Todo[]>
      todosCreateTodo: (projectId: string, title: string) => Promise<Todo>
      todosUpdateTodo: (id: string, patch: TodoUpdatePatch) => Promise<Todo>
      todosReorderTodo: (id: string, status: TodoStatus, beforeId: string | null) => Promise<Todo>
      todosArchiveTodo: (id: string, archived: boolean) => Promise<Todo>
      todosDeleteTodo: (id: string) => Promise<void>
      todosAddComment: (todoId: string, body: string, attachments?: string[]) => Promise<Todo>
      todosSaveAttachment: (dataUrl: string) => Promise<string>
      todosReadAttachmentDataUrl: (id: string) => Promise<string>
      todosMcpEnable: () => Promise<void>
      todosMcpDisable: () => Promise<void>
      onTodosChanged: (cb: () => void) => () => void

      notesGetRoot: () => Promise<string>
      notesCreateNote: (dirPath: string, name: string) => Promise<NotesEntryResult>
      notesCreateFolder: (dirPath: string, name: string) => Promise<NotesEntryResult>
      notesRenameEntry: (oldPath: string, newName: string, isNote: boolean) => Promise<NotesEntryResult>
      notesSearch: (query: string) => Promise<NotesSearchResult[]>
      notesMcpEnable: () => Promise<void>
      notesMcpDisable: () => Promise<void>
      browserMcpEnable: () => Promise<void>
      browserMcpDisable: () => Promise<void>
      onNotesChanged: (cb: () => void) => () => void

      setWindowTitle: (root: string) => void

      autocompleteComplete: (prefix: string, suffix: string, language: string, model: string) => Promise<string | null>

      commitMessageGenerate: (diff: string, model: string, customPrompt: string) => Promise<string | null>

      inlineEditStart: (payload: InlineEditStartPayload) => void
      inlineEditCancel: () => void
      onInlineEditEvent: (cb: (event: InlineEditEvent) => void) => () => void

      onboardingGetStatus: () => Promise<OnboardingStatus>
      onboardingMarkComplete: () => Promise<void>
      onboardingReset: () => Promise<void>
      onboardingDetectCli: (bin: string) => Promise<boolean>
      onboardingGetGitIdentity: () => Promise<GitIdentity>
      onboardingSetGitIdentity: (name: string, email: string) => Promise<void>
      onboardingPrimeAutomationPermission: () => Promise<boolean>
      onboardingOpenAutomationSettings: () => Promise<void>

      graphifyIsAvailable: () => Promise<boolean>
      graphifyRun: (id: string, cwd: string) => Promise<void>
      graphifyReadGraph: (cwd: string) => Promise<GraphifyGraph>
      graphifyInstallClaudeSkill: (cwd: string) => Promise<{ ok: boolean; output: string }>
      onGraphifyData: (cb: (id: string, data: string) => void) => () => void
      onGraphifyExit: (cb: (id: string, code: number) => void) => () => void

      lspDetectAll: () => Promise<Record<LspServerId, DetectResult & { label: string; ramEstimate: string }>>
      lspInstall: (id: string) => Promise<void>
      lspSetEnabled: (id: string, enabled: boolean) => void
      lspGetDefinition: (params: {
        language: string
        projectRoot: string
        filePath: string
        content: string
        line: number
        column: number
      }) => Promise<DefinitionLocation[]>
      onLspInstallData: (cb: (id: string, chunk: string) => void) => () => void
      onLspInstallExit: (cb: (id: string, code: number) => void) => () => void
    }
  }
}

export {}
