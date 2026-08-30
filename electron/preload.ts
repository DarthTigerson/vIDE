import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  readImageDataUrl: (path: string) => ipcRenderer.invoke('fs:readImageDataUrl', path),
  pathExists: (path: string) => ipcRenderer.invoke('fs:exists', path),
  getHomeDir: () => ipcRenderer.invoke('fs:homeDir'),
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', path, content),
  mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
  renamePath: (from: string, to: string) => ipcRenderer.invoke('fs:rename', from, to),
  trashPath: (path: string) => ipcRenderer.invoke('fs:trash', path),
  listAllFiles: (root: string) => ipcRenderer.invoke('fs:listAllFiles', root),
  searchText: (root: string, query: string, caseSensitive: boolean) =>
    ipcRenderer.invoke('fs:searchText', root, query, caseSensitive),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getSystemMemoryUsage: () => ipcRenderer.invoke('system:getMemoryUsage'),
  fsWatchRoot: (cwd: string | null) => ipcRenderer.send('fs:watchRoot', cwd),
  onFsChanged: (cb: (cwd: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, cwd: string) => cb(cwd)
    ipcRenderer.on('fs:changed', handler)
    return () => ipcRenderer.removeListener('fs:changed', handler)
  },

  gitBranch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
  gitAheadBehind: (cwd: string) => ipcRenderer.invoke('git:aheadBehind', cwd),
  gitStatus: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
  gitListIgnored: (cwd: string) => ipcRenderer.invoke('git:listIgnored', cwd),
  gitStage: (cwd: string, paths: string[]) => ipcRenderer.invoke('git:stage', cwd, paths),
  gitUnstage: (cwd: string, paths: string[]) => ipcRenderer.invoke('git:unstage', cwd, paths),
  gitStageAll: (cwd: string) => ipcRenderer.invoke('git:stageAll', cwd),
  gitUnstageAll: (cwd: string) => ipcRenderer.invoke('git:unstageAll', cwd),
  gitDiscard: (cwd: string, path: string) => ipcRenderer.invoke('git:discard', cwd, path),
  gitDiscardAll: (cwd: string) => ipcRenderer.invoke('git:discardAll', cwd),
  gitCommit: (cwd: string, message: string, noVerify?: boolean) =>
    ipcRenderer.invoke('git:commit', cwd, message, noVerify),
  gitDiff: (cwd: string, path: string, staged: boolean) =>
    ipcRenderer.invoke('git:diff', cwd, path, staged),
  gitFileAtHead: (cwd: string, path: string) => ipcRenderer.invoke('git:fileAtHead', cwd, path),
  gitCommitDiff: (cwd: string, hash: string, path: string) =>
    ipcRenderer.invoke('git:commitDiff', cwd, hash, path),
  gitRunCommand: (id: string, cwd: string, action: string, payload?: unknown) =>
    ipcRenderer.invoke('git:runCommand', id, cwd, action, payload),
  onGitLogData: (cb: (id: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data)
    ipcRenderer.on('git:log:data', handler)
    return () => ipcRenderer.removeListener('git:log:data', handler)
  },
  onGitLogExit: (cb: (id: string, code: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, code: number) => cb(id, code)
    ipcRenderer.on('git:log:exit', handler)
    return () => ipcRenderer.removeListener('git:log:exit', handler)
  },
  gitLogResize: (cols: number, rows: number) => ipcRenderer.send('git:log:resize', cols, rows),
  gitGraph: (cwd: string, offset?: number, limit?: number) => ipcRenderer.invoke('git:graph', cwd, offset, limit),
  gitBranches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
  gitDefaultBranch: (cwd: string) => ipcRenderer.invoke('git:defaultBranch', cwd),
  gitBranchList: (cwd: string) => ipcRenderer.invoke('git:branchList', cwd),
  gitBranchDiff: (cwd: string, source: string, target: string, offset?: number, limit?: number) =>
    ipcRenderer.invoke('git:branchDiff', cwd, source, target, offset, limit),
  gitShowStat: (cwd: string, hash: string) => ipcRenderer.invoke('git:showStat', cwd, hash),
  gitFetchSilent: (cwd: string) => ipcRenderer.invoke('git:fetchSilent', cwd),
  gitStagedDiff: (cwd: string) => ipcRenderer.invoke('git:stagedDiff', cwd) as Promise<string>,
  gitDiscoverRepos: (root: string, maxDepth?: number) =>
    ipcRenderer.invoke('git:discoverRepos', root, maxDepth) as Promise<string[]>,
  gitWatchRoot: (cwd: string | null) => ipcRenderer.send('git:watchRoot', cwd),
  onGitChanged: (cb: (cwd: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, cwd: string) => cb(cwd)
    ipcRenderer.on('git:changed', handler)
    return () => ipcRenderer.removeListener('git:changed', handler)
  },

  dockerStatus: () => ipcRenderer.invoke('docker:status') as Promise<import('./docker').DockerStatus>,
  dockerListContainers: () =>
    ipcRenderer.invoke('docker:listContainers') as Promise<import('./docker').DockerContainer[]>,
  dockerStartContainer: (id: string) =>
    ipcRenderer.invoke('docker:startContainer', id) as Promise<import('./docker').DockerActionResult>,
  dockerStopContainer: (id: string) =>
    ipcRenderer.invoke('docker:stopContainer', id) as Promise<import('./docker').DockerActionResult>,
  dockerRestartContainer: (id: string) =>
    ipcRenderer.invoke('docker:restartContainer', id) as Promise<import('./docker').DockerActionResult>,
  dockerRemoveContainer: (id: string) =>
    ipcRenderer.invoke('docker:removeContainer', id) as Promise<import('./docker').DockerActionResult>,
  dockerOpenApp: () => ipcRenderer.invoke('docker:openApp') as Promise<import('./docker').DockerActionResult>,
  dockerRunLogs: (streamId: string, containerId: string) =>
    ipcRenderer.invoke('docker:runLogs', streamId, containerId),
  dockerStopLogs: (streamId: string) => ipcRenderer.send('docker:stopLogs', streamId),
  onDockerLogData: (cb: (streamId: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, streamId: string, data: string) => cb(streamId, data)
    ipcRenderer.on('docker:log:data', handler)
    return () => ipcRenderer.removeListener('docker:log:data', handler)
  },
  onDockerLogExit: (cb: (streamId: string, code: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, streamId: string, code: number) => cb(streamId, code)
    ipcRenderer.on('docker:log:exit', handler)
    return () => ipcRenderer.removeListener('docker:log:exit', handler)
  },
  dockerWatch: () => ipcRenderer.send('docker:watch'),
  dockerUnwatch: () => ipcRenderer.send('docker:unwatch'),
  onDockerChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('docker:changed', handler)
    return () => ipcRenderer.removeListener('docker:changed', handler)
  },

  termSpawn: (id: string, cwd?: string) => ipcRenderer.invoke('term:spawn', id, cwd),
  termKill: (id: string) => ipcRenderer.invoke('term:kill', id),
  termWrite: (id: string, data: string) => ipcRenderer.send('term:write', id, data),
  termResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('term:resize', id, cols, rows),
  onTermData: (cb: (id: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data)
    ipcRenderer.on('term:data', handler)
    return () => ipcRenderer.removeListener('term:data', handler)
  },
  onTermExit: (cb: (id: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on('term:exit', handler)
    return () => ipcRenderer.removeListener('term:exit', handler)
  },

  assistantSpawn: (cwd: string, assistant: 'claude' | 'codex', mode?: 'new' | 'continue' | 'resume') =>
    ipcRenderer.invoke('assistant:spawn', cwd, assistant, mode),
  assistantWrite: (assistant: 'claude' | 'codex', data: string) =>
    ipcRenderer.send('assistant:write', assistant, data),
  assistantResize: (assistant: 'claude' | 'codex', cols: number, rows: number) =>
    ipcRenderer.send('assistant:resize', assistant, cols, rows),
  onAssistantData: (cb: (assistant: 'claude' | 'codex', data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, assistant: 'claude' | 'codex', data: string) => cb(assistant, data)
    ipcRenderer.on('assistant:data', handler)
    return () => ipcRenderer.removeListener('assistant:data', handler)
  },
  onAssistantBusy: (cb: (assistant: 'claude' | 'codex', busy: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, assistant: 'claude' | 'codex', busy: boolean) => cb(assistant, busy)
    ipcRenderer.on('assistant:busy', handler)
    return () => ipcRenderer.removeListener('assistant:busy', handler)
  },
  onBrowserOpenExternalUrl: (cb: (url: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => cb(url)
    ipcRenderer.on('browser:open-external-url', handler)
    return () => ipcRenderer.removeListener('browser:open-external-url', handler)
  },

  mobileStart: () => ipcRenderer.invoke('mobile:start'),
  mobileStop: () => ipcRenderer.invoke('mobile:stop'),
  mobileGetState: () => ipcRenderer.invoke('mobile:getState'),
  mobileAddDevice: () => ipcRenderer.invoke('mobile:addDevice'),
  mobileSelectInterface: (address: string) => ipcRenderer.invoke('mobile:selectInterface', address),
  mobileDisconnectDevice: (id: string) => ipcRenderer.invoke('mobile:disconnectDevice', id),
  mobileDisconnectAll: () => ipcRenderer.invoke('mobile:disconnectAll'),
  mobileSetDisplay: (theme: string, font: string) => ipcRenderer.send('mobile:setDisplay', theme, font),
  onMobileState: (cb: (state: import('./mobile').MobileState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: import('./mobile').MobileState) => cb(state)
    ipcRenderer.on('mobile:state', handler)
    return () => ipcRenderer.removeListener('mobile:state', handler)
  },

  usageAcquire: () => ipcRenderer.invoke('usage:acquire'),
  usageRelease: () => ipcRenderer.invoke('usage:release'),
  usageGetLatest: () => ipcRenderer.invoke('usage:getLatest'),
  usageGetRange: (fromTs: number, toTs: number, maxPoints?: number) =>
    ipcRenderer.invoke('usage:getRange', fromTs, toTs, maxPoints) as Promise<import('./usagePoller').UsageSnapshot[]>,
  usageGetPassiveEnabled: () => ipcRenderer.invoke('usage:getPassiveEnabled'),
  usageSetPassiveEnabled: (enabled: boolean) => ipcRenderer.invoke('usage:setPassiveEnabled', enabled),
  onUsageUpdate: (cb: (latest: import('./usagePoller').LatestUsage | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, latest: import('./usagePoller').LatestUsage | null) => cb(latest)
    ipcRenderer.on('usage:update', handler)
    return () => ipcRenderer.removeListener('usage:update', handler)
  },

  updateGetLatest: () => ipcRenderer.invoke('update:getLatest'),
  updateRestart: () => ipcRenderer.send('update:restart'),
  getChangelogForVersion: (version: string) => ipcRenderer.invoke('changelog:getForVersion', version),
  onUpdateAvailable: (cb: (info: import('./updateChecker').UpdateInfo | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: import('./updateChecker').UpdateInfo | null) => cb(info)
    ipcRenderer.on('update:available', handler)
    return () => ipcRenderer.removeListener('update:available', handler)
  },
  onUpdateUpToDate: (cb: (version: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, version: string) => cb(version)
    ipcRenderer.on('update:upToDate', handler)
    return () => ipcRenderer.removeListener('update:upToDate', handler)
  },

  bridgeSend: (cwd: string, messages: unknown[], agentMode: boolean, settings: unknown) =>
    ipcRenderer.send('bridge:send', { cwd, messages, agentMode, settings }),
  bridgeApprove: (toolCallId: string) => ipcRenderer.send('bridge:approve', toolCallId),
  bridgeReject: (toolCallId: string) => ipcRenderer.send('bridge:reject', toolCallId),
  bridgeCancel: () => ipcRenderer.send('bridge:cancel'),
  bridgeTestConnection: (settings: unknown) => ipcRenderer.invoke('bridge:testConnection', settings),
  bridgeGetSettings: () => ipcRenderer.invoke('bridge:getSettings'),
  bridgeSetSettings: (settings: unknown) => ipcRenderer.invoke('bridge:setSettings', settings),
  onBridgeEvent: (cb: (event: import('./bridge').BridgeEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: import('./bridge').BridgeEvent) => cb(event)
    ipcRenderer.on('bridge:event', handler)
    return () => ipcRenderer.removeListener('bridge:event', handler)
  },

  onMenuOpenProject: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:openProject', handler)
    return () => ipcRenderer.removeListener('menu:openProject', handler)
  },
  getInitialProject: () => ipcRenderer.invoke('window:getInitialProject'),
  onMenuCloseActiveTab: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:closeActiveTab', handler)
    return () => ipcRenderer.removeListener('menu:closeActiveTab', handler)
  },
  onMenuZoomIn: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:zoomIn', handler)
    return () => ipcRenderer.removeListener('menu:zoomIn', handler)
  },
  onMenuZoomOut: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:zoomOut', handler)
    return () => ipcRenderer.removeListener('menu:zoomOut', handler)
  },
  onMenuResetZoom: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:resetZoom', handler)
    return () => ipcRenderer.removeListener('menu:resetZoom', handler)
  },
  onMenuOpenSettings: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:openSettings', handler)
    return () => ipcRenderer.removeListener('menu:openSettings', handler)
  },
  onMenuNewFile: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:newFile', handler)
    return () => ipcRenderer.removeListener('menu:newFile', handler)
  },
  onMenuNewFolder: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:newFolder', handler)
    return () => ipcRenderer.removeListener('menu:newFolder', handler)
  },
  onMenuNewTerminal: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:newTerminal', handler)
    return () => ipcRenderer.removeListener('menu:newTerminal', handler)
  },
  onMenuReopenClosedTab: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:reopenClosedTab', handler)
    return () => ipcRenderer.removeListener('menu:reopenClosedTab', handler)
  },
  onMenuSave: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:save', handler)
    return () => ipcRenderer.removeListener('menu:save', handler)
  },
  onMenuFind: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:find', handler)
    return () => ipcRenderer.removeListener('menu:find', handler)
  },
  onMenuFindInFiles: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:findInFiles', handler)
    return () => ipcRenderer.removeListener('menu:findInFiles', handler)
  },
  onMenuToggleSidebar: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:toggleSidebar', handler)
    return () => ipcRenderer.removeListener('menu:toggleSidebar', handler)
  },
  onMenuCommandPalette: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:commandPalette', handler)
    return () => ipcRenderer.removeListener('menu:commandPalette', handler)
  },
  onMenuActionPalette: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:actionPalette', handler)
    return () => ipcRenderer.removeListener('menu:actionPalette', handler)
  },
  onMenuToggleClaudeChat: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:toggleClaudeChat', handler)
    return () => ipcRenderer.removeListener('menu:toggleClaudeChat', handler)
  },
  onMenuRecentProjectsPalette: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:recentProjectsPalette', handler)
    return () => ipcRenderer.removeListener('menu:recentProjectsPalette', handler)
  },

  openProjectInNewWindow: (path: string) => ipcRenderer.invoke('window:openInNewWindow', path),
  focusProjectIfOpen: (path: string) => ipcRenderer.invoke('window:focusProjectIfOpen', path),

  devtoolsAttach: (targetId: number, hostId: number) =>
    ipcRenderer.invoke('devtools:attach', targetId, hostId),
  devtoolsDetach: (targetId: number) => ipcRenderer.invoke('devtools:detach', targetId),

  browserViewCreate: (id: string, url: string) => ipcRenderer.invoke('browserView:create', id, url),
  browserViewSetBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('browserView:setBounds', id, bounds),
  browserViewSetVisible: (id: string, visible: boolean) =>
    ipcRenderer.invoke('browserView:setVisible', id, visible),
  browserViewNavigate: (id: string, url: string) => ipcRenderer.invoke('browserView:navigate', id, url),
  browserViewGoBack: (id: string) => ipcRenderer.invoke('browserView:goBack', id),
  browserViewGoForward: (id: string) => ipcRenderer.invoke('browserView:goForward', id),
  browserViewReload: (id: string) => ipcRenderer.invoke('browserView:reload', id),
  browserViewZoomIn: (id: string) => ipcRenderer.invoke('browserView:zoomIn', id),
  browserViewZoomOut: (id: string) => ipcRenderer.invoke('browserView:zoomOut', id),
  browserViewZoomReset: (id: string) => ipcRenderer.invoke('browserView:zoomReset', id),
  browserViewSetMobileMode: (
    id: string,
    enabled: boolean,
    device?: { width: number; height: number; pixelRatio: number }
  ) => ipcRenderer.invoke('browserView:setMobileMode', id, enabled, device),
  browserViewClearCache: (id: string) => ipcRenderer.invoke('browserView:clearCache', id),
  browserViewDestroy: (id: string) => ipcRenderer.invoke('browserView:destroy', id),
  onBrowserViewEvent: (cb: (id: string, event: import('./browserViews').BrowserViewEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, event: import('./browserViews').BrowserViewEvent) =>
      cb(id, event)
    ipcRenderer.on('browserView:event', handler)
    return () => ipcRenderer.removeListener('browserView:event', handler)
  },

  sessionLoad: (projectRoot: string) => ipcRenderer.invoke('session:load', projectRoot),
  sessionSave: (projectRoot: string, data: unknown) =>
    ipcRenderer.invoke('session:save', projectRoot, data),

  recentProjectsList: () => ipcRenderer.invoke('recentProjects:list'),
  recentProjectsAdd: (path: string) => ipcRenderer.invoke('recentProjects:add', path),
  recentProjectsClear: () => ipcRenderer.invoke('recentProjects:clear'),

  todosListProjects: () => ipcRenderer.invoke('todos:listProjects'),
  todosCreateProject: (name: string, key: string) => ipcRenderer.invoke('todos:createProject', name, key),
  todosListTodos: (projectId: string) => ipcRenderer.invoke('todos:listTodos', projectId),
  todosCreateTodo: (projectId: string, title: string) => ipcRenderer.invoke('todos:createTodo', projectId, title),
  todosUpdateTodo: (id: string, patch: unknown) => ipcRenderer.invoke('todos:updateTodo', id, patch),
  todosReorderTodo: (id: string, status: string, beforeId: string | null) =>
    ipcRenderer.invoke('todos:reorderTodo', id, status, beforeId),
  todosArchiveTodo: (id: string, archived: boolean) => ipcRenderer.invoke('todos:archiveTodo', id, archived),
  todosDeleteTodo: (id: string) => ipcRenderer.invoke('todos:deleteTodo', id),
  todosAddComment: (todoId: string, body: string, attachments?: string[]) =>
    ipcRenderer.invoke('todos:addComment', todoId, body, attachments),
  todosSaveAttachment: (dataUrl: string) => ipcRenderer.invoke('todos:saveAttachment', dataUrl),
  todosReadAttachmentDataUrl: (id: string) => ipcRenderer.invoke('todos:readAttachmentDataUrl', id),
  todosMcpEnable: () => ipcRenderer.invoke('todos:mcp:enable'),
  todosMcpDisable: () => ipcRenderer.invoke('todos:mcp:disable'),
  onTodosChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('todos:changed', handler)
    return () => ipcRenderer.removeListener('todos:changed', handler)
  },

  notesGetRoot: () => ipcRenderer.invoke('notes:getRoot'),
  notesCreateNote: (dirPath: string, name: string) => ipcRenderer.invoke('notes:createNote', dirPath, name),
  notesCreateFolder: (dirPath: string, name: string) => ipcRenderer.invoke('notes:createFolder', dirPath, name),
  notesRenameEntry: (oldPath: string, newName: string, isNote: boolean) =>
    ipcRenderer.invoke('notes:renameEntry', oldPath, newName, isNote),
  notesSearch: (query: string) => ipcRenderer.invoke('notes:search', query),
  notesMcpEnable: () => ipcRenderer.invoke('notes:mcp:enable'),
  notesMcpDisable: () => ipcRenderer.invoke('notes:mcp:disable'),
  onNotesChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('notes:changed', handler)
    return () => ipcRenderer.removeListener('notes:changed', handler)
  },

  setWindowTitle: (root: string) => ipcRenderer.send('window:setTitle', root),

  autocompleteComplete: (prefix: string, suffix: string, language: string, model: string) =>
    ipcRenderer.invoke('autocomplete:complete', prefix, suffix, language, model),

  commitMessageGenerate: (diff: string, model: string, customPrompt: string) =>
    ipcRenderer.invoke('commitMessage:generate', diff, model, customPrompt) as Promise<string | null>,

  inlineEditStart: (payload: import('./inlineEdit').InlineEditStartPayload) =>
    ipcRenderer.send('inlineEdit:start', payload),
  inlineEditCancel: () => ipcRenderer.send('inlineEdit:cancel'),
  onInlineEditEvent: (cb: (event: import('./inlineEdit').InlineEditEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: import('./inlineEdit').InlineEditEvent) => cb(event)
    ipcRenderer.on('inlineEdit:event', handler)
    return () => ipcRenderer.removeListener('inlineEdit:event', handler)
  },

  lspDetectAll: () => ipcRenderer.invoke('lsp:detectAll'),
  lspInstall: (id: string) => ipcRenderer.invoke('lsp:install', id),
  lspSetEnabled: (id: string, enabled: boolean) => ipcRenderer.send('lsp:setEnabled', id, enabled),
  lspGetDefinition: (params: {
    language: string
    projectRoot: string
    filePath: string
    content: string
    line: number
    column: number
  }) => ipcRenderer.invoke('lsp:getDefinition', params),
  onLspInstallData: (cb: (id: string, chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, chunk: string) => cb(id, chunk)
    ipcRenderer.on('lsp:install:data', handler)
    return () => ipcRenderer.removeListener('lsp:install:data', handler)
  },
  onLspInstallExit: (cb: (id: string, code: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, code: number) => cb(id, code)
    ipcRenderer.on('lsp:install:exit', handler)
    return () => ipcRenderer.removeListener('lsp:install:exit', handler)
  },

  onboardingGetStatus: () => ipcRenderer.invoke('onboarding:getStatus'),
  onboardingMarkComplete: () => ipcRenderer.invoke('onboarding:markComplete'),
  onboardingReset: () => ipcRenderer.invoke('onboarding:reset'),
  onboardingDetectCli: (bin: string) => ipcRenderer.invoke('onboarding:detectCli', bin),
  onboardingGetGitIdentity: () => ipcRenderer.invoke('onboarding:getGitIdentity'),
  onboardingSetGitIdentity: (name: string, email: string) =>
    ipcRenderer.invoke('onboarding:setGitIdentity', name, email),
  onboardingPrimeAutomationPermission: () => ipcRenderer.invoke('onboarding:primeAutomationPermission'),
  onboardingOpenAutomationSettings: () => ipcRenderer.invoke('onboarding:openAutomationSettings'),

  graphifyIsAvailable: () => ipcRenderer.invoke('graphify:isAvailable'),
  graphifyRun: (id: string, cwd: string) => ipcRenderer.invoke('graphify:run', id, cwd),
  graphifyReadGraph: (cwd: string) => ipcRenderer.invoke('graphify:readGraph', cwd),
  graphifyInstallClaudeSkill: (cwd: string) => ipcRenderer.invoke('graphify:installClaudeSkill', cwd),
  onGraphifyData: (cb: (id: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data)
    ipcRenderer.on('graphify:data', handler)
    return () => ipcRenderer.removeListener('graphify:data', handler)
  },
  onGraphifyExit: (cb: (id: string, code: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, code: number) => cb(id, code)
    ipcRenderer.on('graphify:exit', handler)
    return () => ipcRenderer.removeListener('graphify:exit', handler)
  },
})
