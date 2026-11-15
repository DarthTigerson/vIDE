// Main-side host for store apps: loads installed (and dev) apps, activates
// their main.js, routes `vide.app.call` requests and owns the apps:* IPC.

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import type { StoreApp } from '../storeRegistry'
import type { AppInstaller } from './appInstaller'
import { APP_API_VERSION, parseManifest, type AgentToolDecl, type AppManifest } from './appManifest'
import type { AppContributes, AppInfo, AppStatus } from './appTypes'
import { readInstalled, writeInstalled } from './installedApps'
import { createMainVideApi, type AgentToolHandler } from './mainVideApi'
import { PackageHolder, inspectPackage, type FileSummary } from './installFromFile'

export type { AppContributes, AppStatus, AppInfo }

export interface AppHostOptions {
  appsDir: string
  installer: AppInstaller
  getListing: (id: string) => Promise<StoreApp | null>
  isDev: boolean
  currentVersion: string
  broadcast: (channel: string, ...args: unknown[]) => void
  sendTo: (windowId: number, channel: string, ...args: unknown[]) => void
  requireFn?: (path: string) => unknown
  // Names of vIDE's own agent tools; an app tool with one of these is skipped.
  reservedToolNames?: () => Iterable<string>
}

export interface AppAgentTools {
  appId: string
  appName: string
  instructions?: string
  tools: AgentToolDecl[]
}

export const AGENT_TOOL_TIMEOUT_MS = 60_000

interface Entry {
  manifest: AppManifest
  root: string | null
  source: 'store' | 'dev' | 'file'
  status: AppStatus
  error?: string
  mainActivated: boolean
  // Bumps on every load, so a reloaded dev folder gets a fresh module URL.
  loadSeq?: number
  mainModule?: { deactivate?: () => void }
  handlers: Map<string, Function>
  toolHandlers: Map<string, AgentToolHandler>
  closeListeners: Set<(id: number) => void>
  children: Map<{ kill(): void }, number | undefined>
}

type Result = { ok: true } | { ok: false; error: string }
export type InstallOutcome = { ok: true; id: string; name: string; version: string } | { ok: false; error: string }
export type PickResult = { ok: true; summary: FileSummary } | { ok: false; error: string }

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// Versioned so a new version, or a dev reload, is fetched fresh.
function assetUrl(e: Entry, rel: string): string {
  const v = e.source === 'dev' ? `${e.manifest.version}-${e.loadSeq ?? 0}` : e.manifest.version
  return `vide-app://${e.manifest.id}/${rel}?v=${v}`
}

export class AppHost {
  private readonly entries = new Map<string, Entry>()
  private readonly requireFn: (path: string) => unknown
  private loadCounter = 0
  private readonly packages = new PackageHolder()

  constructor(private readonly opts: AppHostOptions) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.requireFn = opts.requireFn ?? ((p) => require(p))
  }

  async start(): Promise<void> {
    this.sweep()
    for (const rec of readInstalled(this.opts.appsDir)) {
      await this.load(this.opts.installer.installDir(rec.id, rec.version), rec.source === 'file' ? 'file' : 'store', rec.id, rec.disabled === true)
    }
    if (this.opts.isDev) {
      for (const dir of this.readDev()) await this.load(dir, 'dev')
    }
    // A window may have asked for the list while main.js halves were still
    // activating; tell it to ask again.
    this.opts.broadcast('apps:changed')
  }

  list(): AppInfo[] {
    return [...this.entries.values()].map((e) => {
      const info: AppInfo = {
        id: e.manifest.id,
        name: e.manifest.name,
        version: e.manifest.version,
        source: e.source,
        rendererUrl: assetUrl(e, e.manifest.renderer),
        ...(e.manifest.style ? { styleUrl: assetUrl(e, e.manifest.style) } : {}),
        hasMain: e.manifest.main !== undefined,
        contributes: e.manifest.contributes,
        status: e.status
      }
      if (e.manifest.agentTools) {
        info.agentTools = e.manifest.agentTools.tools.map(({ name, description }) => ({ name, description }))
      }
      if (e.manifest.icon) info.icon = e.manifest.icon
      if (e.error) info.error = e.error
      return info
    })
  }

  // Agent tools of every enabled app, apps ordered by id. A tool whose name
  // is reserved (built-in) or already taken by an earlier app is skipped.
  agentToolList(reservedNames: Iterable<string> = this.opts.reservedToolNames?.() ?? []): AppAgentTools[] {
    const taken = new Set(reservedNames)
    const out: AppAgentTools[] = []
    const entries = [...this.entries.values()]
      .filter((e) => e.status === 'loaded' && e.manifest.agentTools)
      .sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0))
    for (const e of entries) {
      const decl = e.manifest.agentTools!
      const tools = decl.tools.filter((t) => {
        if (taken.has(t.name)) {
          console.warn(`[apps] ${e.manifest.id}: agent tool "${t.name}" skipped, the name is already taken`)
          return false
        }
        taken.add(t.name)
        return true
      })
      if (tools.length === 0) continue
      out.push({
        appId: e.manifest.id,
        appName: e.manifest.name,
        ...(decl.instructions ? { instructions: decl.instructions } : {}),
        tools
      })
    }
    return out
  }

  // Runs an app's handler for an agent tool call. Activates nothing: a tool
  // whose handler was never registered is an error naming the app.
  async callAgentTool(name: string, args: Record<string, unknown>, windowId?: number): Promise<string> {
    const owner = this.agentToolList().find((a) => a.tools.some((t) => t.name === name))
    if (!owner) throw new Error(`Unknown tool: ${name}`)
    const entry = this.entries.get(owner.appId)!
    const fn = entry.toolHandlers.get(name)
    if (!fn) throw new Error(`${owner.appName} did not register ${name}`)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} did not finish within ${AGENT_TOOL_TIMEOUT_MS / 1000}s`)), AGENT_TOOL_TIMEOUT_MS)
    })
    try {
      const result = await Promise.race([Promise.resolve().then(() => fn(args, { windowId })), timeout])
      return typeof result === 'string' ? result : String(result?.text ?? '')
    } finally {
      clearTimeout(timer)
    }
  }

  async install(id: string): Promise<InstallOutcome> {
    try {
      if (this.entries.get(id)?.source === 'dev') {
        return { ok: false, error: `An app with id ${id} is loaded from a folder. Unload it first.` }
      }
      const listing = await this.opts.getListing(id)
      if (!listing) return { ok: false, error: 'App not found in the Store.' }
      const result = await this.opts.installer.install(listing)
      if (!result.ok) return result
      return await this.activateInstalled(id, result.record.version, 'store', listing.name)
    } catch (e) {
      return { ok: false, error: msg(e) }
    }
  }

  // Brings a just-installed folder into the running app.
  private async activateInstalled(id: string, version: string, source: 'store' | 'file', name: string): Promise<InstallOutcome> {
    const dir = this.opts.installer.installDir(id, version)
    const existing = this.entries.get(id)
    // An update keeps an app the user switched off switched off (the installer
    // carries the flag over), so it is loaded as disabled, not activated.
    const disabled = readInstalled(this.opts.appsDir).find((r) => r.id === id)?.disabled === true
    if (existing?.mainActivated && !disabled) {
      // The old main.js keeps running until restart; the new folder is what
      // renderer assets resolve against (the old one is gone).
      existing.status = 'restart-required'
      existing.root = dir
      existing.source = source
    } else {
      const loaded = await this.load(dir, source, id, disabled)
      if (typeof loaded === 'string') {
        this.opts.broadcast('apps:changed')
        return { ok: false, error: loaded }
      }
    }
    this.opts.broadcast('apps:changed')
    return { ok: true, id, name, version }
  }

  // Install from file, step 1: read and inspect a package; nothing is installed.
  async inspectFile(path: string): Promise<PickResult> {
    try {
      const max = this.opts.installer.packageMaxBytes
      if (statSync(path).size > max) return { ok: false, error: 'That file is larger than an app may be.' }
      const zip = new Uint8Array(readFileSync(path))
      const res = await inspectPackage(zip, {
        currentVersion: this.opts.currentVersion,
        listingFor: (id) => this.opts.getListing(id),
      })
      if (!res.ok) return res
      if (this.entries.get(res.summary.id)?.source === 'dev') {
        return { ok: false, error: `An app with id ${res.summary.id} is loaded from a folder. Unload it first.` }
      }
      const token = this.packages.hold({ zip, ...res.summary })
      return { ok: true, summary: { token, ...res.summary } }
    } catch {
      return { ok: false, error: "Couldn't read that file." }
    }
  }

  // Install from file, step 2: the user confirmed. A package that matches the
  // catalog's latest release installs exactly like a Store install; anything
  // else is flagged `source: 'file'` (no updates).
  async installHeld(token: string): Promise<InstallOutcome> {
    const pkg = this.packages.take(token)
    if (!pkg) return { ok: false, error: 'That install expired. Pick the file again.' }
    try {
      if (this.entries.get(pkg.id)?.source === 'dev') {
        return { ok: false, error: `An app with id ${pkg.id} is loaded from a folder. Unload it first.` }
      }
      const listing = pkg.matchesStore ? await this.opts.getListing(pkg.id) : null
      const result = await this.opts.installer.installZip(pkg.zip, listing ? { listing } : {})
      if (!result.ok) return result
      return await this.activateInstalled(pkg.id, pkg.version, listing ? 'store' : 'file', pkg.name)
    } catch (e) {
      return { ok: false, error: msg(e) }
    }
  }

  async uninstall(id: string): Promise<Result> {
    try {
      const result = this.opts.installer.uninstall(id)
      if (!result.ok) return result
      const existing = this.entries.get(id)
      if (existing?.mainActivated) {
        existing.status = 'restart-required'
        existing.root = null
        this.killChildren(existing)
      } else if (existing) {
        this.teardown(existing)
        this.entries.delete(id)
      }
      this.opts.broadcast('apps:changed')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: msg(e) }
    }
  }

  // Switches a store app off or on without uninstalling it. The choice is kept
  // in installed.json. A main half that was already activated can't be unloaded,
  // so it keeps running until restart; enabling it again just reconnects.
  async setEnabled(id: string, enabled: boolean): Promise<Result> {
    try {
      const entry = this.entries.get(id)
      if (!entry || entry.source === 'dev') return { ok: false, error: 'Only installed apps can be turned off.' }
      if (entry.status === 'restart-required') return { ok: false, error: 'Restart vIDE first.' }
      const records = readInstalled(this.opts.appsDir)
      const record = records.find((r) => r.id === id)
      if (!record) return { ok: false, error: 'Not installed.' }
      const { disabled: _d, ...rest } = record
      void _d
      writeInstalled(this.opts.appsDir, records.map((r) => (r.id === id ? (enabled ? rest : { ...rest, disabled: true as const }) : r)))
      if (!enabled) {
        entry.status = 'disabled'
        delete entry.error
        // main.js can't be unloaded, but nothing it started should keep running.
        this.killChildren(entry)
      } else if (entry.mainActivated) {
        entry.status = 'loaded'
      } else {
        const loaded = await this.load(this.opts.installer.installDir(id, record.version), entry.source, id)
        if (typeof loaded === 'string') {
          this.opts.broadcast('apps:changed')
          return { ok: false, error: loaded }
        }
      }
      this.opts.broadcast('apps:changed')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: msg(e) }
    }
  }

  async call(appId: string, method: string, payload: unknown, windowId: number): Promise<unknown> {
    const fn = this.entries.get(appId)?.handlers.get(method)
    if (!fn) throw new Error(`No handler ${method}`)
    return fn(payload, { windowId })
  }

  async loadDevFolder(dir: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    if (!this.opts.isDev) return { ok: false, error: 'Dev apps are only available in development builds.' }
    const entry = await this.load(dir, 'dev')
    if (typeof entry === 'string') return { ok: false, error: entry }
    const dirs = this.readDev()
    if (!dirs.includes(dir)) this.writeDev([...dirs, dir])
    this.opts.broadcast('apps:changed')
    return { ok: true, id: entry.manifest.id }
  }

  unloadDev(id: string): void {
    const entry = this.entries.get(id)
    if (!entry || entry.source !== 'dev') return
    this.teardown(entry)
    this.entries.delete(id)
    this.writeDev(this.readDev().filter((d) => d !== entry.root))
    this.opts.broadcast('apps:changed')
  }

  readonly rootFor = (appId: string): string | null => this.entries.get(appId)?.root ?? null

  disposeWindow(windowId: number): void {
    for (const e of this.entries.values()) {
      for (const [child, wid] of [...e.children]) {
        if (wid === windowId) { try { child.kill() } catch { /* already gone */ } e.children.delete(child) }
      }
      for (const cb of [...e.closeListeners]) {
        try { cb(windowId) } catch { /* an app must not break window teardown */ }
      }
    }
  }

  registerHandlers(): void {
    ipcMain.handle('apps:list', () => this.list())
    ipcMain.handle('apps:install', (_e, id: string) => this.install(id))
    ipcMain.handle('apps:uninstall', (_e, id: string) => this.uninstall(id))
    ipcMain.handle('apps:setEnabled', (_e, id: string, enabled: boolean) => this.setEnabled(String(id), enabled === true))
    ipcMain.handle('apps:call', (e, appId: string, method: string, payload: unknown) =>
      this.call(appId, method, payload, BrowserWindow.fromWebContents(e.sender)?.id ?? -1))
    ipcMain.handle('apps:pickPackage', async (e): Promise<PickResult> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options = {
        properties: ['openFile' as const],
        filters: [{ name: 'vSuite app package', extensions: ['zip'] }],
      }
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: '' }
      return this.inspectFile(picked.filePaths[0])
    })
    ipcMain.handle('apps:installPackage', (_e, token: string) => this.installHeld(String(token)))
    ipcMain.handle('apps:discardPackage', (_e, token: string) => this.packages.discard(String(token)))
    ipcMain.handle('apps:isDev', () => this.opts.isDev)
    ipcMain.handle('apps:loadDevFolder', async (e) => {
      if (!this.opts.isDev) return { ok: false, error: 'Dev apps are only available in development builds.' }
      const win = BrowserWindow.fromWebContents(e.sender)
      const options = { properties: ['openDirectory' as const] }
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: 'Cancelled.' }
      return this.loadDevFolder(picked.filePaths[0])
    })
    ipcMain.handle('apps:unloadDev', (_e, id: string) => this.unloadDev(id))
    ipcMain.handle('apps:restart', () => {
      // quit(), not exit(): lets the renderer's last localStorage writes flush
      // (same reason as update:restart in main.ts).
      app.relaunch()
      app.quit()
    })
  }

  private killChildren(e: Entry): void {
    for (const child of [...e.children.keys()]) {
      try { child.kill() } catch { /* already gone */ }
    }
    e.children.clear()
  }

  // Stops an app's main half: deactivate, drop handlers/listeners, kill children.
  private teardown(e: Entry): void {
    try { e.mainModule?.deactivate?.() } catch { /* best effort */ }
    e.handlers.clear()
    e.toolHandlers.clear()
    e.closeListeners.clear()
    this.killChildren(e)
  }

  // Loads one app folder into `entries`. Returns the entry, or a reason string
  // when the manifest is unusable (no entry is created then, unless the id is known).
  private async load(dir: string, source: 'store' | 'dev' | 'file', expectedId?: string, disabled = false): Promise<Entry | string> {
    let manifest: AppManifest
    try {
      const parsed = parseManifest(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')))
      if (typeof parsed === 'string') throw new Error(parsed)
      manifest = parsed
      if (manifest.apiVersion !== APP_API_VERSION) throw new Error('Built for a newer vIDE. Update vIDE first.')
      if (!existsSync(join(dir, manifest.renderer))) throw new Error('renderer missing')
      if (expectedId !== undefined && manifest.id !== expectedId) throw new Error('manifest id mismatch')
      const clash = this.entries.get(manifest.id)
      if (clash && (clash.source === 'dev') !== (source === 'dev')) throw new Error(`An app with id ${manifest.id} is already loaded.`)
    } catch (e) {
      const reason = msg(e)
      if (expectedId !== undefined && this.entries.get(expectedId)?.source !== 'dev') {
        // Keep the broken installed app visible as failed (never over a dev app).
        this.entries.set(expectedId, {
          manifest: { id: expectedId, name: expectedId, version: '', apiVersion: APP_API_VERSION, minVide: '0.0.0', renderer: 'renderer.js', contributes: {} },
          root: dir, source, status: 'failed', error: reason, mainActivated: false,
          handlers: new Map(), toolHandlers: new Map(), closeListeners: new Set(), children: new Map()
        })
      }
      return reason
    }

    const entry: Entry = {
      manifest, root: dir, source, status: 'loaded', mainActivated: false,
      handlers: new Map(), toolHandlers: new Map(), closeListeners: new Set(), children: new Map(),
      loadSeq: ++this.loadCounter
    }
    const previous = this.entries.get(manifest.id)
    if (previous) this.teardown(previous)
    this.entries.set(manifest.id, entry)
    if (disabled) {
      entry.status = 'disabled'
      return entry
    }
    if (manifest.main) {
      try {
        // A dev folder is edited between loads: drop Node's cached copy.
        if (source === 'dev' && !this.opts.requireFn) {
          for (const key of Object.keys(require.cache)) if (key.startsWith(dir)) delete require.cache[key]
        }
        const mod = this.requireFn(join(dir, manifest.main)) as { activate?: (v: unknown) => void | Promise<void>; deactivate?: () => void }
        entry.mainModule = mod
        const vide = createMainVideApi(manifest.id, {
          handlers: entry.handlers,
          declaredTools: manifest.agentTools?.tools,
          toolHandlers: entry.toolHandlers,
          closeListeners: entry.closeListeners,
          trackChild: (child, windowId) => {
            entry.children.set(child, windowId)
            return () => { entry.children.delete(child) }
          },
          emit: (event, payload, windowId) => {
            if (windowId === undefined) this.opts.broadcast('apps:event', manifest.id, event, payload)
            else this.opts.sendTo(windowId, 'apps:event', manifest.id, event, payload)
          }
        })
        // A main half that never settles must not hold up vIDE's startup.
        await withTimeout(Promise.resolve(mod.activate?.(vide)), ACTIVATE_TIMEOUT_MS)
        entry.mainActivated = true
      } catch (e) {
        entry.status = 'failed'
        entry.error = msg(e)
        this.teardown(entry)
      }
    }
    return entry
  }

  private sweep(): void {
    const { appsDir } = this.opts
    try { rmSync(join(appsDir, '.tmp'), { recursive: true, force: true }) } catch { /* ignore */ }
    let ids: string[] = []
    try { ids = readdirSync(appsDir) } catch { return }
    for (const id of ids) {
      try {
        for (const name of readdirSync(join(appsDir, id))) {
          if (name.includes('.old-')) rmSync(join(appsDir, id, name), { recursive: true, force: true })
        }
      } catch { /* not a directory */ }
    }
  }

  private readDev(): string[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(this.opts.appsDir, 'dev.json'), 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : []
    } catch {
      return []
    }
  }

  private writeDev(dirs: string[]): void {
    mkdirSync(this.opts.appsDir, { recursive: true })
    writeFileSync(join(this.opts.appsDir, 'dev.json'), JSON.stringify(dirs, null, 2))
  }
}

export const ACTIVATE_TIMEOUT_MS = 10_000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`activate did not finish within ${ms / 1000}s`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}
