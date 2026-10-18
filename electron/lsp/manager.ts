import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath, pathToFileURL } from 'url'
import { LspConnection } from './protocol'
import { LSP_SERVERS } from './servers'
import type { DefinitionLocation, LspServerId, LspServerModule } from './types'

interface RunningServer {
  connection: LspConnection
  proc: ChildProcessWithoutNullStreams
  initialized: Promise<void>
  openDocs: Set<string>
  projectRoot: string
}

interface WindowState {
  enabled: Set<LspServerId>
  servers: Map<LspServerId, RunningServer>
}

export interface GetDefinitionParams {
  language: string
  projectRoot: string
  filePath: string
  content: string
  line: number
  column: number
}

// Owns one language-server child process per (window, language) pair —
// mirrors ClaudeManager's `byWindow` keying (electron/claude.ts) since each
// window is its own project root here too. A server only spawns once its
// toggle is enabled *and* a file of that language is actually opened
// (ensureServer is only reached from the definition-request path), so
// enabling e.g. Rust in a window with no .rs files open costs nothing.
export class LanguageServerManager {
  private byWindow = new Map<number, WindowState>()

  registerHandlers(): void {
    ipcMain.handle('lsp:detectAll', async () => {
      const entries = await Promise.all(
        Object.values(LSP_SERVERS).map(async (server) => {
          const result = await server.detect()
          return [server.id, { ...result, label: server.label, ramEstimate: server.ramEstimate }] as const
        })
      )
      return Object.fromEntries(entries)
    })

    ipcMain.handle('lsp:install', async (event, id: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const server = LSP_SERVERS[id as LspServerId]
      if (!server || !win) return
      const send = (chunk: string) => {
        if (!win.isDestroyed()) win.webContents.send('lsp:install:data', id, chunk)
      }
      try {
        await server.install(send)
        if (!win.isDestroyed()) win.webContents.send('lsp:install:exit', id, 0)
      } catch (err) {
        send(`\nError: ${err instanceof Error ? err.message : String(err)}\n`)
        if (!win.isDestroyed()) win.webContents.send('lsp:install:exit', id, 1)
      }
    })

    ipcMain.on('lsp:setEnabled', (event, id: string, enabled: boolean) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      const state = this.stateFor(win.id)
      const serverId = id as LspServerId
      if (enabled) {
        state.enabled.add(serverId)
      } else {
        state.enabled.delete(serverId)
        this.stopServer(win.id, serverId)
      }
    })

    ipcMain.handle(
      'lsp:getDefinition',
      async (event, params: GetDefinitionParams): Promise<DefinitionLocation[]> => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return []
        const server = Object.values(LSP_SERVERS).find((s) => s.monacoLanguageIds.includes(params.language))
        if (!server) return []
        const state = this.stateFor(win.id)
        if (!state.enabled.has(server.id)) return []

        try {
          const running = await this.ensureServer(win.id, server, params.projectRoot)
          if (!running) return []
          this.ensureOpen(running, params.filePath, params.language, params.content)

          const result = await running.connection.request('textDocument/definition', {
            textDocument: { uri: pathToFileURL(params.filePath).toString() },
            position: { line: params.line - 1, character: params.column - 1 },
          })
          return normalizeLocations(result)
        } catch (err) {
          console.error(`[lsp] definition request failed for ${server.id}:`, err)
          return []
        }
      }
    )
  }

  private stateFor(winId: number): WindowState {
    let state = this.byWindow.get(winId)
    if (!state) {
      state = { enabled: new Set(), servers: new Map() }
      this.byWindow.set(winId, state)
    }
    return state
  }

  private async ensureServer(
    winId: number,
    server: LspServerModule,
    projectRoot: string
  ): Promise<RunningServer | null> {
    const state = this.stateFor(winId)
    const existing = state.servers.get(server.id)
    if (existing) {
      if (existing.projectRoot === projectRoot) return existing
      // Project root changed under this window (rare — e.g. a new project
      // opened into the same window) — the old server is rooted at the
      // wrong workspace, so replace it rather than reuse it.
      this.stopServer(winId, server.id)
    }

    const spawnSpec = await server.getSpawn()
    if (!spawnSpec) return null

    const proc = spawn(spawnSpec.command, spawnSpec.args, { cwd: projectRoot }) as ChildProcessWithoutNullStreams
    // Language servers log diagnostics/trace info to stderr as a matter of
    // course — not surfaced in v1, but the listener must exist or a full
    // stderr pipe buffer would eventually stall the process.
    proc.stderr.on('data', () => {})

    const connection = new LspConnection(proc)
    const running: RunningServer = {
      connection,
      proc,
      openDocs: new Set(),
      projectRoot,
      initialized: Promise.resolve(),
    }
    running.initialized = connection
      .request('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(projectRoot).toString(),
        capabilities: {},
      })
      .then(() => {
        connection.notify('initialized', {})
      })

    state.servers.set(server.id, running)
    proc.on('exit', () => {
      if (state.servers.get(server.id) === running) state.servers.delete(server.id)
    })

    await running.initialized
    return running
  }

  private ensureOpen(running: RunningServer, filePath: string, languageId: string, content: string): void {
    const uri = pathToFileURL(filePath).toString()
    if (running.openDocs.has(uri)) {
      running.connection.notify('textDocument/didChange', {
        textDocument: { uri, version: Date.now() },
        contentChanges: [{ text: content }],
      })
      return
    }
    running.openDocs.add(uri)
    running.connection.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: content },
    })
  }

  private stopServer(winId: number, serverId: LspServerId): void {
    const state = this.byWindow.get(winId)
    const running = state?.servers.get(serverId)
    if (!running) return
    running.connection.notify('exit', {})
    running.proc.kill()
    state?.servers.delete(serverId)
  }

  // Every running language server, for the RAM panel (system:getMemoryBreakdown).
  listPids(): number[] {
    return [...this.byWindow.values()].flatMap((state) =>
      [...state.servers.values()].flatMap((server) => (server.proc.pid ? [server.proc.pid] : []))
    )
  }

  disposeWindow(winId: number): void {
    const state = this.byWindow.get(winId)
    if (!state) return
    for (const id of state.servers.keys()) this.stopServer(winId, id)
    this.byWindow.delete(winId)
  }
}

function normalizeLocations(result: unknown): DefinitionLocation[] {
  const arr = Array.isArray(result) ? result : result ? [result] : []
  return arr
    .map((loc): DefinitionLocation | null => {
      const record = loc as { uri?: string; targetUri?: string; range?: LspRange; targetSelectionRange?: LspRange }
      const uri = record.uri ?? record.targetUri
      const range = record.range ?? record.targetSelectionRange
      if (!uri || !range) return null
      try {
        return { path: fileURLToPath(uri), line: range.start.line + 1, col: range.start.character + 1 }
      } catch {
        return null
      }
    })
    .filter((v): v is DefinitionLocation => v !== null)
}

interface LspRange {
  start: { line: number; character: number }
}
