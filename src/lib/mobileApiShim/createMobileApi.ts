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

function invokeFactory(ws: WebSocket, pending: PendingMap, method: string) {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ type: 'invoke', id, method, args }))
    })
}

function sendFactory(ws: WebSocket, method: string) {
  return (...args: unknown[]) => ws.send(JSON.stringify({ type: 'send', method, args }))
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

  const invoke = (method: string) => invokeFactory(ws, pending, method)
  const send = (method: string) => sendFactory(ws, method)
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
    termWrite: send('term:write'),
    termResize: send('term:resize'),
    onTermData: on('term:data'),
    onTermExit: on('term:exit'),

    // claude — mirrors electron/mobileRelay/channels/claudeChannels.ts
    claudeSpawn: invoke('claude:spawn'),
    claudeWrite: send('claude:write'),
    claudeResize: send('claude:resize'),
    claudeKill: send('claude:kill'),
    onClaudeData: on('claude:data'),
    onClaudeBusy: on('claude:busy'),
  }
}
