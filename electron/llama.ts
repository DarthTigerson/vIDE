import { ipcMain, BrowserWindow } from 'electron'
import { spawn, execFile } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { WebContents } from 'electron'
import { llamaAsset } from './autocomplete/catalog'
import type { findInstalledLlamaServer, installLlama } from './autocomplete/llamaInstall'

// Model paths in the config are written the way the user writes them in a
// terminal (the instructions note uses `~/models/...`), but llama-server and
// existsSync() don't expand `~` — do it here, once, at the process boundary.
function expandTilde(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return homedir() + p.slice(1)
  return p
}

// vIDE-managed model configuration — the renderer assembles the full config
// (see LlamaModelConfig in src/stores/llamaModelsStore.ts, mirroring
// notes/vIDE/Bridge/create-model-instructions.md) and the main process
// translates the llama.cpp fields into launch arguments.
export interface LlamaLaunchConfig {
  modelPath: string
  serverExecutable: string
  host: string
  port: number
  apiKey: string
  contextSize: number
  batchSize: number
  gpuLayers: number
  parallelRequests: number
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  alias: string
}

export function buildLlamaServerArgs(cfg: LlamaLaunchConfig): string[] {
  const args = [
    '-m', expandTilde(cfg.modelPath),
    '-c', String(cfg.contextSize),
    '--batch-size', String(cfg.batchSize),
    '-ngl', String(cfg.gpuLayers),
    '-np', String(cfg.parallelRequests),
    '--reasoning-effort', cfg.reasoningEffort,
    '--host', cfg.host,
    '--port', String(cfg.port),
    '--api-key', cfg.apiKey,
  ]
  // Omitted entirely when empty — an empty alias string would become a
  // literal empty argument.
  if (cfg.alias) args.push('--alias', cfg.alias)
  return args
}

// llama.cpp ships several binaries; `llama-server` is the one that hosts the
// OpenAI-compatible API (what vIDE's model launch flow will talk to), so it
// is the primary availability probe. `llama-cli` is probed as a fallback for
// older llama.cpp releases that predate the standalone server binary.
const LLAMA_BINARIES = ['llama-server', 'llama-cli']

// Electron-launched apps (Finder/Dock, not `npm run dev` from a terminal)
// don't inherit the interactive shell's PATH, so a bare spawn('llama-server',
// ...) fails whenever the binary lives outside the default system PATH (e.g.
// a Homebrew install in a cell, or a build in ~/bin). Mirrors
// resolveGraphifyPath() in electron/graphify.ts: resolve the absolute path
// once via a login shell and cache it.
let cachedLlamaPath: string | null | undefined
let pendingLlamaPathResolution: Promise<string | null> | undefined

export function resolveLlamaPath(): Promise<string | null> {
  if (cachedLlamaPath !== undefined) return Promise.resolve(cachedLlamaPath)
  if (pendingLlamaPathResolution) return pendingLlamaPathResolution

  pendingLlamaPathResolution = new Promise<string | null>((resolve) => {
    const shell = process.env.SHELL ?? '/bin/zsh'
    // Probe both binaries in one login-shell call so a single resolution
    // pass finds whichever llama.cpp version the user has installed.
    execFile(shell, ['-lic', `command -v ${LLAMA_BINARIES[0]} || command -v ${LLAMA_BINARIES[1]}`], (err, stdout) => {
      // `-lic` runs an interactive login shell, which sources .zshrc/.zprofile
      // and can prepend banners or version-manager output to stdout. Take the
      // last non-empty line rather than the whole trimmed output, and require
      // it to look like an absolute path.
      const lines = (stdout ? stdout.toString() : '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      const lastLine = lines[lines.length - 1]
      const resolved = !err && lastLine && lastLine.startsWith('/') ? lastLine : null

      if (resolved) {
        // Only cache successes — caching a failure would silently disable the
        // absolute-path resolution for the rest of the app session on a
        // transient hiccup (shell not ready yet, PATH not sourced yet, etc.).
        cachedLlamaPath = resolved
        resolve(resolved)
        return
      }

      // `command -v a || command -v b` exits 1 when neither binary exists —
      // that's just "llama.cpp isn't installed", an expected state the renderer
      // surfaces in the footer notification and the Llama panel. Only a shell
      // that couldn't run, exited any other way, or printed something that isn't
      // a path is worth an error log.
      const notInstalled = !!err && (err as { code?: unknown }).code === 1
      if (!notInstalled) {
        console.error('[llama] failed to resolve llama.cpp binary path via login shell:', err ?? `unexpected output: ${JSON.stringify(stdout)}`)
      }
      resolve(null)
    })
  })

  pendingLlamaPathResolution.finally(() => {
    pendingLlamaPathResolution = undefined
  })

  return pendingLlamaPathResolution
}

export function _resetLlamaPathCacheForTesting(): void {
  cachedLlamaPath = undefined
  pendingLlamaPathResolution = undefined
}

// `ps -axo pid=,rss=,comm=` output (rss in KB; comm may be a full path with
// spaces), summed over llama-server processes not in `excludePids`.
export function sumLlamaServerRss(stdout: string, excludePids: number[]): number | null {
  let total = 0
  let found = false
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
    if (!match || !match[3].includes('llama-server')) continue
    if (excludePids.includes(Number(match[1]))) continue
    total += Number(match[2])
    found = true
  }
  return found ? total * 1024 : null
}

// vIDE's own pinned llama.cpp build, the same copy autocomplete runs: what
// Settings > Llama's install button puts on a Mac without Homebrew's.
export interface BundledLlama {
  dir: string
  find: typeof findInstalledLlamaServer
  install: typeof installLlama
}

export interface LlamaInstallInfo {
  path: string | null
  source: 'system' | 'vide' | null
  // The pinned build's download size for this platform (null: none published).
  downloadBytes: number | null
}

export class LlamaManager {
  private running = new Map<string, ReturnType<typeof spawn>>()
  private installing: Promise<{ ok: true; path: string } | { ok: false; error: string }> | null = null

  // vIDE's own autocomplete server is a llama-server too, but it has its own
  // row in the RAM panel; counting it here as well would show it twice.
  constructor(private excludedPids: () => number[] = () => [], private bundled: BundledLlama | null = null) {}

  // A llama.cpp the user installed (on PATH) wins; vIDE's own copy otherwise.
  private async getInstall(): Promise<LlamaInstallInfo> {
    const downloadBytes = llamaAsset(process.platform)?.bytes ?? null
    const system = await resolveLlamaPath()
    if (system) return { path: system, source: 'system', downloadBytes }
    const own = this.bundled ? await this.bundled.find(this.bundled.dir) : null
    return { path: own, source: own ? 'vide' : null, downloadBytes }
  }

  private async resolveBinary(): Promise<string | null> {
    return (await this.getInstall()).path
  }

  // One install at a time, however many windows ask; progress goes to the
  // window whose button started it.
  private install(sender: WebContents): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (this.installing) return this.installing
    const bundled = this.bundled
    if (!bundled) return Promise.resolve({ ok: false, error: 'Installing llama.cpp is not available here' })
    const running = bundled.install(bundled.dir, {
      onProgress: (received, total) => { if (!sender.isDestroyed()) sender.send('llama:installProgress', received, total) },
    }).then(
      (path) => ({ ok: true as const, path }),
      (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }),
    ).finally(() => { this.installing = null })
    this.installing = running
    return running
  }

  registerHandlers(): void {
    // Prewarm the login-shell resolution at startup so it's usually already
    // cached by the time the Llama panel first mounts.
    resolveLlamaPath()

    ipcMain.handle('llama:isAvailable', () => this.checkAvailable())
    ipcMain.handle('llama:getInstall', () => this.getInstall())
    ipcMain.handle('llama:install', (event) => this.install(event.sender))
    ipcMain.handle('llama:start', async (event, id: string, cfg: LlamaLaunchConfig) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      await this.spawnServer(id, cfg, win)
    })
    ipcMain.handle('llama:stop', (_event, id: string) => {
      const proc = this.running.get(id)
      if (!proc) return
      this.running.delete(id)
      proc.kill()
    })
    ipcMain.handle('llama:getMemoryUsage', () => this.getRunningMemoryBytes())
  }

  private async getRunningMemoryBytes(): Promise<number | null> {
    // Use ps to find all llama-server processes by name — this picks up
    // servers started externally or in a prior session, not just ones spawned
    // by this LlamaManager instance.
    return new Promise((resolve) => {
      execFile('ps', ['-axo', 'pid=,rss=,comm='], (err, stdout) => {
        resolve(err ? null : sumLlamaServerRss(stdout, this.excludedPids()))
      })
    })
  }

  // Streams llama-server's stdout/stderr back to the originating window under
  // `id` and reports `llama:exit` on close — the graphify:run pattern. One
  // server per `id`; starting a second one for the same id first kills the
  // existing process (a relaunch from the editor page replaces the old run).
  private async spawnServer(id: string, cfg: LlamaLaunchConfig, win: BrowserWindow): Promise<void> {
    const existing = this.running.get(id)
    if (existing) {
      this.running.delete(id)
      existing.kill()
    }

    const send = (channel: string, payload: unknown) => {
      if (!win.isDestroyed()) win.webContents.send(channel, id, payload)
    }

    const modelPath = expandTilde(cfg.modelPath)
    if (!existsSync(modelPath)) {
      send('llama:data', `Error: model file not found: ${modelPath}\r\n`)
      send('llama:exit', 1)
      return
    }

    // Empty serverExecutable means "auto-detect" — the login-shell PATH
    // resolution cached from the availability probe (falling back to the bare
    // command name, which produces a clean ENOENT error message below).
    const bin = cfg.serverExecutable
      ? expandTilde(cfg.serverExecutable)
      : ((await this.resolveBinary()) || LLAMA_BINARIES[0])
    const proc = spawn(bin, buildLlamaServerArgs(cfg), {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.running.set(id, proc)

    proc.stdout?.on('data', (chunk: Buffer) => send('llama:data', chunk.toString()))
    proc.stderr?.on('data', (chunk: Buffer) => send('llama:data', chunk.toString()))
    proc.on('error', (err: NodeJS.ErrnoException) => {
      this.running.delete(id)
      send('llama:data', err.code === 'ENOENT'
        ? `Error: llama-server executable not found. Set the server path in the model config.\r\n`
        : `\r\nError: ${err.message}\r\n`)
      send('llama:exit', 1)
    })
    proc.on('close', (code: number | null) => {
      this.running.delete(id)
      send('llama:exit', code ?? 1)
    })
  }

  private async checkAvailable(): Promise<boolean> {
    const bin = (await this.resolveBinary()) ?? LLAMA_BINARIES[0]
    return new Promise((resolve) => {
      const proc = spawn(bin, ['--help'], { stdio: 'ignore' })
      proc.on('spawn', () => resolve(true))
      proc.on('error', () => resolve(false))
    })
  }
}
