import { BrowserWindow, ipcMain, app } from 'electron'
import { randomBytes } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MODEL_CATALOG, RAM_OVERHEAD_BYTES, fits } from './catalog'
import { downloadFile } from './download'
import { probeCompletion, requestCompletion, type CompletionEndpoint, type ExtraChunk } from './infill'
import { GraphContext } from './graphContext'
import { bundledLlamaDir, findInstalledLlamaServer, findModelOnDisk, installLlama, llamaCacheDir } from './llamaInstall'
import { LlamaServerProcess, buildServerArgs, freePort } from './server'
import type { AutocompleteRuntimeState, AutocompleteSource } from './types'
import { getSystemMemoryUsage } from '../systemMemory'

export interface ServerLike {
  start(binary: string, args: string[], port: number, apiKey: string): Promise<void>
  stop(): void
  readonly pid: number | null
  onExit(cb: (code: number | null, lastLog: string) => void): void
}

export interface ManagerDeps {
  userDataDir: string
  platform: NodeJS.Platform
  modelSearchDirs: string[]
  getMemory: () => Promise<{ totalBytes: number; usedBytes: number }>
  findInstalledLlamaServer: typeof findInstalledLlamaServer
  installLlama: typeof installLlama
  findModelOnDisk: typeof findModelOnDisk
  download: typeof downloadFile
  fileSize: (path: string) => Promise<number | null>
  createServer: () => ServerLike
  freePort: () => Promise<number>
  requestCompletion: typeof requestCompletion
  probeCompletion: typeof probeCompletion
  graphContext: Pick<GraphContext, 'chunksFor'>
  broadcast: (state: AutocompleteRuntimeState) => void
}

function defaultDeps(): ManagerDeps {
  const userDataDir = app.getPath('userData')
  return {
    userDataDir,
    platform: process.platform,
    modelSearchDirs: [join(userDataDir, 'autocomplete', 'models'), llamaCacheDir()],
    getMemory: getSystemMemoryUsage,
    findInstalledLlamaServer,
    installLlama,
    findModelOnDisk,
    download: downloadFile,
    fileSize: (path) => stat(path).then((s) => (s.isFile() ? s.size : null), () => null),
    createServer: () => new LlamaServerProcess(),
    freePort,
    requestCompletion,
    probeCompletion,
    graphContext: new GraphContext(),
    broadcast: (state) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('autocomplete:state', state)
      }
    },
  }
}

// GB as the RAM panel shows them (src/lib/memoryBreakdown.ts formatMemory).
const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1)

// Extra llama-server flags as typed in settings: whitespace-separated, with
// single or double quotes around an argument that contains spaces.
function splitArgs(text: string): string[] {
  return (text.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((a) => a.replace(/^(["'])(.*)\1$/, '$2'))
}

// One editor request: the text around the cursor, the file it's in (for the
// project graph lookup) and snippets from the other open files.
export interface AutocompleteRequest {
  prefix: string
  suffix: string
  filePath?: string
  extra?: ExtraChunk[]
}

const BUSY_PHASES = new Set(['installing', 'downloading', 'starting', 'running'])

// Owns the one autocomplete model for the whole app (every window shares it):
// installing vIDE's pinned llama.cpp, downloading the GGUF, the RAM fit
// check, the llama-server process and the completion requests. The renderer
// only configures a source, asks to start/stop, and mirrors the state pushed
// on every change.
export class AutocompleteManager {
  private deps: ManagerDeps
  private state: AutocompleteRuntimeState = {
    phase: 'idle', source: null, modelOnDisk: false, progress: null, ramBytes: null, error: null,
  }
  private server: ServerLike | null = null
  private endpoint: CompletionEndpoint | null = null
  private work: AbortController | null = null
  // Bumped by stop()/configure() so a start() still awaiting a download or
  // a server load knows its result is no longer wanted.
  private run = 0
  private inFlight = new Map<number, AbortController>()
  // Set synchronously by start() so a second window's start() during the
  // first one's awaits joins it instead of starting a second server.
  private pending: Promise<void> | null = null

  constructor(deps?: Partial<ManagerDeps>) {
    this.deps = { ...(deps?.userDataDir ? ({} as ManagerDeps) : defaultDeps()), ...deps } as ManagerDeps
  }

  get pid(): number | null {
    return this.server?.pid ?? null
  }

  private get llamaDir(): string {
    return bundledLlamaDir(this.deps.userDataDir)
  }

  private get modelsDir(): string {
    return join(this.deps.userDataDir, 'autocomplete', 'models')
  }

  registerHandlers(): void {
    ipcMain.handle('autocomplete:configure', (_e, source: AutocompleteSource | null) => this.configure(source))
    ipcMain.handle('autocomplete:start', (_e, force?: boolean) => this.start(force === true))
    ipcMain.handle('autocomplete:stop', () => this.stop())
    ipcMain.handle('autocomplete:getState', () => this.getState())
    ipcMain.handle('autocomplete:complete', (event, req: AutocompleteRequest) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return win ? this.complete(win.id, req) : null
    })
  }

  getState(): AutocompleteRuntimeState {
    return { ...this.state }
  }

  private set(patch: Partial<AutocompleteRuntimeState>): void {
    this.state = { ...this.state, ...patch }
    this.deps.broadcast(this.getState())
  }

  async configure(source: AutocompleteSource | null): Promise<AutocompleteRuntimeState> {
    if (JSON.stringify(source) !== JSON.stringify(this.state.source)) {
      this.halt()
      this.set({ source, phase: 'idle', progress: null, error: null })
    }
    await this.refreshDisk()
    return this.getState()
  }

  private async refreshDisk(): Promise<void> {
    const source = this.state.source
    if (!source) {
      this.set({ modelOnDisk: false, ramBytes: null })
    } else if (source.kind === 'managed') {
      const model = MODEL_CATALOG[source.modelId]
      const found = await this.deps.findModelOnDisk(model, this.deps.modelSearchDirs)
      this.set({ modelOnDisk: found !== null, ramBytes: model.ramBytes })
    } else if (source.kind === 'gguf') {
      const size = source.path ? await this.deps.fileSize(source.path) : null
      this.set({ modelOnDisk: size !== null, ramBytes: size === null ? null : size + RAM_OVERHEAD_BYTES })
    } else {
      this.set({ modelOnDisk: true, ramBytes: null })
    }
  }

  start(force = false): Promise<void> {
    if (this.pending) return this.pending
    if (!this.state.source || BUSY_PHASES.has(this.state.phase)) return Promise.resolve()
    const pending = this.doStart(this.state.source, force).finally(() => {
      if (this.pending === pending) this.pending = null
    })
    this.pending = pending
    return pending
  }

  private async doStart(source: AutocompleteSource, force: boolean): Promise<void> {
    const run = ++this.run
    const work = new AbortController()
    this.work = work
    const current = () => run === this.run

    try {
      if (source.kind === 'server') {
        this.set({ phase: 'starting', error: null })
        const endpoint: CompletionEndpoint = { kind: source.api, baseUrl: source.baseUrl, apiKey: source.apiKey || undefined }
        const probe = await this.deps.probeCompletion(endpoint)
        if (!current()) return
        if (!probe.ok) throw new Error(`Couldn't get a completion from ${source.baseUrl}${probe.message ? `: ${probe.message}` : ''}`)
        this.endpoint = endpoint
        this.set({ phase: 'running' })
        return
      }

      // The fit check runs on every start, auto-start included: free RAM at
      // launch (a Bridge model loaded, say) can be far below what it was at
      // setup. A custom GGUF is only warned about in settings, never blocked.
      if (source.kind === 'managed' && !force && this.state.ramBytes !== null) {
        const mem = await this.deps.getMemory()
        if (!current()) return
        if (!fits(this.state.ramBytes, mem)) {
          this.set({
            phase: 'error',
            error: { kind: 'no-fit', message: `Not enough free RAM (needs ~${gb(this.state.ramBytes)} GB, ${gb(mem.totalBytes - mem.usedBytes)} GB free)` },
          })
          return
        }
      }

      // A multi-GB download arrives in tens of thousands of chunks: tell the
      // windows only when the whole percent moves.
      let sentPercent = -1
      const onProgress = (received: number, total: number) => {
        if (!current()) return
        const percent = total > 0 ? Math.floor((received / total) * 100) : 0
        if (percent === sentPercent && received !== total) return
        sentPercent = percent
        this.set({ progress: { received, total } })
      }
      let binary = await this.deps.findInstalledLlamaServer(this.llamaDir)
      if (!current()) return
      if (!binary) {
        this.set({ phase: 'installing', progress: null, error: null })
        binary = await this.deps.installLlama(this.llamaDir, { signal: work.signal, onProgress })
      }
      if (!current()) return

      let modelPath: string
      if (source.kind === 'managed') {
        const model = MODEL_CATALOG[source.modelId]
        const found = await this.deps.findModelOnDisk(model, this.deps.modelSearchDirs)
        if (!current()) return
        if (found) {
          modelPath = found
        } else {
          sentPercent = -1
          this.set({ phase: 'downloading', progress: { received: 0, total: model.bytes }, error: null })
          modelPath = join(this.modelsDir, model.fileName)
          await this.deps.download(model.url, modelPath, { expectedBytes: model.bytes, signal: work.signal, onProgress })
        }
      } else {
        modelPath = source.path
      }
      if (!current()) return

      this.set({ phase: 'starting', progress: null, modelOnDisk: true, error: null })
      const port = await this.deps.freePort()
      if (!current()) return
      const apiKey = randomBytes(16).toString('hex')
      const server = this.deps.createServer()
      server.onExit(() => {
        // Only an exit nobody asked for is news; stop() clears this.server first.
        if (this.server !== server) return
        this.server = null
        this.endpoint = null
        this.set({ phase: 'error', error: { kind: 'failed', message: 'The autocomplete model stopped unexpectedly' } })
      })
      this.server = server
      const extraArgs = source.kind === 'gguf' ? splitArgs(source.extraArgs) : []
      await server.start(binary, buildServerArgs({ modelPath, port, apiKey, platform: this.deps.platform, extraArgs }), port, apiKey)
      if (!current()) {
        server.stop()
        return
      }
      this.endpoint = { kind: 'infill', baseUrl: `http://127.0.0.1:${port}`, apiKey }
      this.set({ phase: 'running' })
    } catch (err) {
      if (!current()) return
      this.server = null
      this.set({ phase: 'error', progress: null, error: { kind: 'failed', message: err instanceof Error ? err.message : String(err) } })
    } finally {
      if (this.work === work) this.work = null
    }
  }

  // Cancels whatever is in progress and kills the server, without a state change.
  private halt(): void {
    this.run++
    this.pending = null
    this.work?.abort()
    this.work = null
    const server = this.server
    this.server = null
    this.endpoint = null
    server?.stop()
    for (const controller of this.inFlight.values()) controller.abort()
    this.inFlight.clear()
  }

  stop(): void {
    this.halt()
    this.set({ phase: 'stopped', progress: null, error: null })
  }

  async complete(windowId: number, req: AutocompleteRequest): Promise<string | null> {
    this.inFlight.get(windowId)?.abort()
    const endpoint = this.endpoint
    if (this.state.phase !== 'running' || !endpoint) return null
    const controller = new AbortController()
    this.inFlight.set(windowId, controller)
    try {
      // The graph's definitions go last, nearest the code being completed.
      const graph = req.filePath
        ? await this.deps.graphContext.chunksFor(req.filePath, req.prefix, req.suffix).catch(() => [])
        : []
      if (controller.signal.aborted) return null
      const extra = [...(req.extra ?? []), ...graph]
      return await this.deps.requestCompletion(endpoint, { prefix: req.prefix, suffix: req.suffix, ...(extra.length ? { extra } : {}) }, controller.signal)
    } finally {
      if (this.inFlight.get(windowId) === controller) this.inFlight.delete(windowId)
    }
  }

  disposeWindow(windowId: number): void {
    this.inFlight.get(windowId)?.abort()
    this.inFlight.delete(windowId)
  }

  // App quit: never leave a multi-GB process behind.
  dispose(): void {
    this.halt()
  }
}
