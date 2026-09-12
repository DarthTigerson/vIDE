// Renderer-side counterpart to electron/preload.ts: a window.api-shaped
// object backed by a WebSocket connection to the mobile relay instead of
// Electron's contextBridge, so the same React app/component code can run in
// a phone's browser. Only covers the channels registerAllRelayChannels()
// actually wires up on the relay side today (git/fs/term/claude, per
// electron/mobileRelay/channels/*.ts) — remaining domains (docker, notes,
// todos, etc.) get added one shim method at a time as later tasks extend
// relay channel coverage, following the same naming convention as
// electron/preload.ts.

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
  }
}
