// Renderer-side counterpart to electron/preload.ts: a window.api-shaped
// object backed by a WebSocket connection to the mobile relay instead of
// Electron's contextBridge, so the same React app/component code can run in
// a phone's browser.
//
// Every method on Window['api'] must exist here, even ones with no relay
// channel to back them — a component with no error boundary calling a
// missing method crashes the entire mobile client on mount. Methods backed
// by a real relay channel (electron/mobileRelay/channels/*.ts) use
// invoke/doSend/on below. Methods whose channel is in
// electron/mobileRelay/excludedChannels.ts (native menus/dialogs, desktop
// BrowserView compositing, the mobile server's own control surface, etc.)
// get a graceful stub instead — resolve/no-op rather than throw, so an
// unsupported-on-mobile feature degrades quietly instead of taking the
// whole app down. The return type is annotated as Window['api'] so a
// future channel added to preload.ts without a matching shim entry is a
// compile error here, not a runtime crash on a phone.

type PendingMap = Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>
type Listeners = Map<string, Set<(...args: unknown[]) => void>>

// Correlation id for invoke/response matching only — no cryptographic
// requirement. Deliberately NOT crypto.randomUUID(): MobileServer serves
// this bundle over plain http:// on a LAN IP (see electron/mobile.ts's
// pairing URL), and Crypto.randomUUID is spec'd secure-context-only —
// browsers only expose it on https:/localhost origins. On a real phone
// loading this page over LAN HTTP, crypto.randomUUID is undefined, so this
// would throw on every single invoke call.
let nextRequestId = 0
function makeRequestId(): string {
  nextRequestId += 1
  return `${Date.now()}-${nextRequestId}`
}

// Outbound messages are queued until the socket actually finishes its
// handshake — createMobileApi() returns synchronously (before `onopen`
// fires) and gets installed as window.api immediately, so any component
// whose mount effect calls a shim method right away would otherwise hit
// ws.send() while readyState is still CONNECTING, which throws.
function makeSender(ws: WebSocket) {
  let open = false
  const queue: string[] = []
  ws.onopen = () => {
    open = true
    for (const data of queue) ws.send(data)
    queue.length = 0
  }
  return (data: string) => {
    if (open) ws.send(data)
    else queue.push(data)
  }
}

function invokeFactory(send: (data: string) => void, pending: PendingMap, method: string) {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = makeRequestId()
      pending.set(id, { resolve, reject })
      send(JSON.stringify({ type: 'invoke', id, method, args }))
    })
}

function sendFactory(send: (data: string) => void, method: string) {
  return (...args: unknown[]) => send(JSON.stringify({ type: 'send', method, args }))
}

function onFactory(listeners: Listeners, event: string) {
  return (cb: (...args: unknown[]) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(cb)
    return () => listeners.get(event)?.delete(cb)
  }
}

// Graceful degradation for channels in electron/mobileRelay/excludedChannels.ts
// (or any other method with no relay channel to back it): resolve/no-op
// instead of throwing, so a desktop-only feature quietly does nothing on
// mobile rather than crashing the whole client.
function stubInvoke<T>(value: T) {
  return (..._args: unknown[]): Promise<T> => Promise.resolve(value)
}
function stubSend() {
  return (..._args: unknown[]): void => {}
}
function stubOn() {
  return (..._args: unknown[]): (() => void) => () => {}
}

export function createMobileApi(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  const pending: PendingMap = new Map()
  const listeners: Listeners = new Map()
  const send = makeSender(ws)

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.type === 'response') {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error))
      else p.resolve(msg.result)
    } else if (msg.type === 'event') {
      for (const cb of listeners.get(msg.event) ?? []) cb(...msg.args)
    }
  }

  // The relay connection is a single LAN WebSocket with no reconnect logic
  // of its own; per the mobile-vide-client design doc's Error Handling
  // section, the chosen v1 strategy for a dropped connection is a full
  // page reload rather than bespoke rehydration. Reject every in-flight
  // invoke first so callers don't hang forever on a connection that's
  // already gone (the reload is async — it doesn't tear down JS state
  // synchronously).
  const handleDisconnect = () => {
    for (const p of pending.values()) p.reject(new Error('mobile relay connection lost'))
    pending.clear()
    if (typeof window !== 'undefined') window.location.reload()
  }
  ws.onclose = handleDisconnect
  ws.onerror = handleDisconnect

  const invoke = (method: string) => invokeFactory(send, pending, method)
  const doSend = (method: string) => sendFactory(send, method)
  const on = (event: string) => onFactory(listeners, event)

  return {
    // fs — mirrors electron/mobileRelay/channels/fsChannels.ts
    readDir: invoke('fs:readDir'),
    readFile: invoke('fs:readFile'),
    readImageDataUrl: invoke('fs:readImageDataUrl'),
    pathExists: invoke('fs:exists'),
    getHomeDir: invoke('fs:homeDir'),
    writeFile: invoke('fs:writeFile'),
    mkdir: invoke('fs:mkdir'),
    renamePath: invoke('fs:rename'),
    trashPath: invoke('fs:trash'),
    listAllFiles: invoke('fs:listAllFiles'),
    searchText: invoke('fs:searchText'),
    onFsChanged: on('fs:changed'),
    // Explicit watch-registration is moot: the relay broadcasts fs:changed
    // to every connected mobile client unconditionally (no per-connection
    // root scoping), so there's nothing for this call to register against.
    // Still needs to exist so callers (e.g. openProject) don't crash.
    fsWatchRoot: stubSend(),

    // git — mirrors electron/mobileRelay/channels/gitChannels.ts
    gitBranch: invoke('git:branch'),
    gitAheadBehind: invoke('git:aheadBehind'),
    gitStatus: invoke('git:status'),
    gitListIgnored: invoke('git:listIgnored'),
    gitStage: invoke('git:stage'),
    gitUnstage: invoke('git:unstage'),
    gitStageAll: invoke('git:stageAll'),
    gitUnstageAll: invoke('git:unstageAll'),
    gitDiscard: invoke('git:discard'),
    gitDiscardAll: invoke('git:discardAll'),
    gitCommit: invoke('git:commit'),
    gitDiff: invoke('git:diff'),
    gitFileAtHead: invoke('git:fileAtHead'),
    gitCommitDiff: invoke('git:commitDiff'),
    gitGraph: invoke('git:graph'),
    gitBranches: invoke('git:branches'),
    gitDefaultBranch: invoke('git:defaultBranch'),
    gitBranchList: invoke('git:branchList'),
    gitBranchDiff: invoke('git:branchDiff'),
    gitShowStat: invoke('git:showStat'),
    gitFetchSilent: invoke('git:fetchSilent'),
    gitStagedDiff: invoke('git:stagedDiff'),
    gitDiscoverRepos: invoke('git:discoverRepos'),
    onGitChanged: on('git:changed'),
    onGitLogData: on('git:log:data'),
    onGitLogExit: on('git:log:exit'),
    // git:runCommand/gitLogResize back the interactive `git log` PTY stream
    // (electron/gitRunner.ts's GitRunner), out of scope per the relay's
    // excluded-channels list — deferred streaming work, not implemented.
    gitRunCommand: stubInvoke(undefined as void),
    gitLogResize: stubSend(),
    // Same "nothing to register against" reasoning as fsWatchRoot above.
    gitWatchRoot: stubSend(),

    // terminal — mirrors electron/mobileRelay/channels/termChannels.ts
    termSpawn: invoke('term:spawn'),
    termKill: invoke('term:kill'),
    termWrite: doSend('term:write'),
    termResize: doSend('term:resize'),
    onTermData: on('term:data'),
    onTermExit: on('term:exit'),

    // claude — mirrors electron/mobileRelay/channels/claudeChannels.ts
    claudeSpawn: invoke('claude:spawn'),
    claudeWrite: doSend('claude:write'),
    claudeResize: doSend('claude:resize'),
    claudeKill: doSend('claude:kill'),
    onClaudeData: on('claude:data'),
    onClaudeBusy: on('claude:busy'),

    // system — mirrors electron/mobileRelay/channels/systemChannels.ts
    getSystemMemoryUsage: invoke('system:getMemoryUsage'),

    // docker — mirrors electron/mobileRelay/channels/dockerChannels.ts
    dockerStatus: invoke('docker:status'),
    dockerListContainers: invoke('docker:listContainers'),
    dockerStartContainer: invoke('docker:startContainer'),
    dockerStopContainer: invoke('docker:stopContainer'),
    dockerRestartContainer: invoke('docker:restartContainer'),
    dockerRemoveContainer: invoke('docker:removeContainer'),
    dockerStartContainers: invoke('docker:startContainers'),
    dockerStopContainers: invoke('docker:stopContainers'),
    dockerRemoveContainers: invoke('docker:removeContainers'),
    dockerGetContainerStats: invoke('docker:getContainerStats'),
    dockerOpenApp: invoke('docker:openApp'),
    dockerCloseApp: invoke('docker:closeApp'),
    onDockerChanged: on('docker:changed'),
    // Docker log streaming needs its own broadcast wiring (comparable to
    // term:data), deferred — excluded on the relay side, stub here too.
    dockerRunLogs: stubInvoke(undefined as void),
    dockerStopLogs: stubSend(),
    dockerWatch: stubSend(),
    dockerUnwatch: stubSend(),

    // changelog — mirrors electron/mobileRelay/channels/changelogChannels.ts
    getChangelogForVersion: invoke('changelog:getForVersion'),

    // onboarding — mirrors electron/mobileRelay/channels/onboardingChannels.ts
    onboardingGetStatus: invoke('onboarding:getStatus'),
    onboardingMarkComplete: invoke('onboarding:markComplete'),
    onboardingReset: invoke('onboarding:reset'),
    onboardingDetectCli: invoke('onboarding:detectCli'),
    onboardingGetGitIdentity: invoke('onboarding:getGitIdentity'),
    onboardingSetGitIdentity: invoke('onboarding:setGitIdentity'),
    onboardingPrimeAutomationPermission: invoke('onboarding:primeAutomationPermission'),
    onboardingOpenAutomationSettings: invoke('onboarding:openAutomationSettings'),

    // recentProjects — mirrors electron/mobileRelay/channels/recentProjectsChannels.ts
    recentProjectsList: invoke('recentProjects:list'),
    recentProjectsAdd: invoke('recentProjects:add'),
    recentProjectsClear: invoke('recentProjects:clear'),

    // window — mirrors electron/mobileRelay/channels/windowChannels.ts
    setWindowTitle: doSend('window:setTitle'),

    // usage — mirrors electron/mobileRelay/channels/usageChannels.ts
    usageAcquire: invoke('usage:acquire'),
    usageRelease: invoke('usage:release'),
    usageGetLatest: invoke('usage:getLatest'),
    usageGetRange: invoke('usage:getRange'),
    usageGetPassiveEnabled: invoke('usage:getPassiveEnabled'),
    usageSetPassiveEnabled: invoke('usage:setPassiveEnabled'),
    onUsageUpdate: on('usage:update'),

    // bridge — mirrors electron/mobileRelay/channels/bridgeChannels.ts
    bridgeSend: doSend('bridge:send'),
    bridgeApprove: doSend('bridge:approve'),
    bridgeReject: doSend('bridge:reject'),
    bridgeCancel: doSend('bridge:cancel'),
    bridgeTestConnection: invoke('bridge:testConnection'),
    bridgeGetSettings: invoke('bridge:getSettings'),
    bridgeSetSettings: invoke('bridge:setSettings'),

    // todos — mirrors electron/mobileRelay/channels/todosChannels.ts
    todosListProjects: invoke('todos:listProjects'),
    todosCreateProject: invoke('todos:createProject'),
    todosRenameProject: invoke('todos:renameProject'),
    todosDeleteProject: invoke('todos:deleteProject'),
    todosListTodos: invoke('todos:listTodos'),
    todosCreateTodo: invoke('todos:createTodo'),
    todosUpdateTodo: invoke('todos:updateTodo'),
    todosReorderTodo: invoke('todos:reorderTodo'),
    todosArchiveTodo: invoke('todos:archiveTodo'),
    todosArchiveTodos: invoke('todos:archiveTodos'),
    todosDeleteTodo: invoke('todos:deleteTodo'),
    todosAddComment: invoke('todos:addComment'),
    todosSaveAttachment: invoke('todos:saveAttachment'),
    todosReadAttachmentDataUrl: invoke('todos:readAttachmentDataUrl'),

    // notes — mirrors electron/mobileRelay/channels/notesChannels.ts
    notesGetRoot: invoke('notes:getRoot'),
    notesCreateNote: invoke('notes:createNote'),
    notesCreateFolder: invoke('notes:createFolder'),
    notesRenameEntry: invoke('notes:renameEntry'),
    notesSearch: invoke('notes:search'),

    // autocomplete — mirrors electron/mobileRelay/channels/autocompleteChannels.ts
    autocompleteComplete: invoke('autocomplete:complete'),

    // commitMessage — mirrors electron/mobileRelay/channels/commitMessageChannels.ts
    commitMessageGenerate: invoke('commitMessage:generate'),

    // inlineEdit — mirrors electron/mobileRelay/channels/inlineEditChannels.ts
    inlineEditStart: invoke('inlineEdit:start'),
    inlineEditCancel: invoke('inlineEdit:cancel'),
    onInlineEditEvent: on('inlineEdit:event'),

    // session — mirrors electron/mobileRelay/channels/sessionChannels.ts
    sessionLoad: invoke('session:load'),
    sessionSave: invoke('session:save'),

    // Event handlers for data sync and bridge events
    onTodosChanged: on('todos:changed'),
    onNotesChanged: on('notes:changed'),
    onBridgeEvent: on('bridge:event'),

    // --- Desktop-only, never relayed (electron/mobileRelay/excludedChannels.ts) ---
    // Every entry below has no relay channel behind it. Stubs only, so a
    // mobile client calling one of these (because the same shared
    // component tree calls it unconditionally on mount) degrades quietly
    // instead of throwing.

    // Native OS dialogs/menus — no phone equivalent
    openFolder: stubInvoke<string | null>(null),
    onMenuOpenProject: stubOn(),
    onMenuCloseActiveTab: stubOn(),
    onMenuZoomIn: stubOn(),
    onMenuZoomOut: stubOn(),
    onMenuResetZoom: stubOn(),
    onMenuOpenSettings: stubOn(),
    onMenuNewFile: stubOn(),
    onMenuNewFolder: stubOn(),
    onMenuNewTerminal: stubOn(),
    onMenuReopenClosedTab: stubOn(),
    onMenuSave: stubOn(),
    onMenuFind: stubOn(),
    onMenuFindInFiles: stubOn(),
    onMenuToggleSidebar: stubOn(),
    onMenuCommandPalette: stubOn(),
    onMenuRecentProjectsPalette: stubOn(),
    onMenuActionPalette: stubOn(),
    onMenuToggleClaudeChat: stubOn(),

    // Desktop window management — no per-window concept for a mobile client
    getInitialProject: stubInvoke<string | null>(null),
    openProjectInNewWindow: stubInvoke(undefined as void),
    focusProjectIfOpen: stubInvoke(false),

    // Desktop BrowserView compositing — renders directly onto the Mac's own
    // screen, calling these from a phone wouldn't make anything visible to
    // the phone user (same reasoning as the relay's exclusion)
    browserViewCreate: stubInvoke<number | null>(null),
    browserViewSetBounds: stubInvoke(undefined as void),
    browserViewSetVisible: stubInvoke(undefined as void),
    browserViewNavigate: stubInvoke(undefined as void),
    browserViewGoBack: stubInvoke(undefined as void),
    browserViewGoForward: stubInvoke(undefined as void),
    browserViewReload: stubInvoke(undefined as void),
    browserViewZoomIn: stubInvoke(undefined as void),
    browserViewZoomOut: stubInvoke(undefined as void),
    browserViewZoomReset: stubInvoke(undefined as void),
    browserViewSetMobileMode: stubInvoke(undefined as void),
    browserViewClearCache: stubInvoke(undefined as void),
    browserViewClearCookies: stubInvoke(undefined as void),
    browserViewDestroy: stubInvoke(undefined as void),
    onBrowserViewEvent: stubOn(),
    onBrowserOpenExternalUrl: stubOn(),
    onOpenClaudeBrowserTab: stubOn(),
    devtoolsAttach: stubInvoke(undefined as void),
    devtoolsDetach: stubInvoke(undefined as void),

    // Mobile server control — a mobile client doesn't control its own
    // pairing server
    mobileStart: stubInvoke(undefined as void),
    mobileStop: stubInvoke(undefined as void),
    mobileGetState: stubInvoke({
      running: false,
      port: 0,
      localIp: '',
      pin: '',
      qrSvg: '',
      connectedCount: 0,
      allowingNewDevice: false,
      interfaces: [],
      devices: [],
    }),
    mobileAddDevice: stubInvoke(undefined as void),
    mobileSelectInterface: stubInvoke(undefined as void),
    mobileDisconnectDevice: stubInvoke(undefined as void),
    mobileDisconnectAll: stubInvoke(undefined as void),
    mobileSetDisplay: stubSend(),
    mobileSetDefaultMode: stubSend(),
    onMobileState: stubOn(),

    // MCP-access toggles — desktop-config-only (the underlying todos/notes/
    // browser DATA operations are genuinely relayed above; only the
    // "give Claude CLI MCP access" toggle is excluded)
    browserMcpEnable: stubInvoke(undefined as void),
    browserMcpDisable: stubInvoke(undefined as void),
    todosMcpEnable: stubInvoke(undefined as void),
    todosMcpDisable: stubInvoke(undefined as void),
    notesMcpEnable: stubInvoke(undefined as void),
    notesMcpDisable: stubInvoke(undefined as void),

    // App-level update checking/restart — tied to this desktop install
    updateGetLatest: stubInvoke(null),
    updateRestart: stubSend(),
    onUpdateAvailable: stubOn(),
    onUpdateUpToDate: stubOn(),

    // Language server management — ambiguous whether these should work
    // from mobile; deferred (relay-side exclusion)
    lspInstall: stubInvoke(undefined as void),
    lspSetEnabled: stubSend(),
    lspDetectAll: stubInvoke({} as unknown as Awaited<ReturnType<Window['api']['lspDetectAll']>>),
    lspGetDefinition: stubInvoke(null as unknown as Awaited<ReturnType<Window['api']['lspGetDefinition']>>),
    onLspInstallData: stubOn(),
    onLspInstallExit: stubOn(),

    // Graphify — peripheral dev-tooling, triggers long-running processes,
    // low real-world value from a phone; deferred (relay-side exclusion)
    graphifyIsAvailable: stubInvoke(false),
    graphifyRun: stubInvoke(undefined as void),
    graphifyReadGraph: stubInvoke(null as unknown as Awaited<ReturnType<Window['api']['graphifyReadGraph']>>),
    graphifyInstallClaudeSkill: stubInvoke({ ok: false, output: 'Not available on mobile.' }),
    onGraphifyData: stubOn(),
    onGraphifyExit: stubOn(),
  }
}
