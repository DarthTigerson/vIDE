import { randomBytes, randomInt } from 'crypto'
import { existsSync, readdirSync, statSync } from 'fs'
import { homedir, userInfo } from 'os'
import { isAbsolute, join } from 'path'
import { AliasTable, Masker, randomWords, type LocalRepo, type MaskerOptions } from './masker'
import { normaliseRepoInput, normaliseRoot } from './normalise'
import { VcloakGateway, TOKEN_HEADER } from './gateway'
import { discoverRepos } from './sources'
import { validateConfig, VcloakStore, type Sealer } from './store'
import type { VcloakConfig, VcloakPreviewResult, VcloakRepoRow, VcloakSetConfigResult, VcloakState } from './types'

export type SpawnCloak = null | { ok: true; url: string; headers: string } | { ok: false; error: string }

interface IpcLike {
  handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void
}

interface ManagerOptions {
  dir: string
  sealer: Sealer
  rgPath: () => Promise<string | null>
  homeDir?: string
  username?: string
  // Tests only
  upstream?: string
}

const SCAN_TTL_MS = 5 * 60_000
const SCAN_WAIT_MS = 15_000
const FS_CACHE_TTL_MS = 60_000
const DASH_WALK_BUDGET = 400
const encSeg = (s: string) => s.replace(/[^A-Za-z0-9]/g, '-')

// Small time-limited cache for file system answers
class TtlCache<V> {
  private map = new Map<string, { v: V; at: number }>()
  get(key: string, make: () => V): V {
    const hit = this.map.get(key)
    if (hit && Date.now() - hit.at < FS_CACHE_TTL_MS) return hit.v
    const v = make()
    this.map.set(key, { v, at: Date.now() })
    return v
  }
  clear(): void {
    this.map.clear()
  }
}

interface Scan {
  repos: LocalRepo[]
  graphify: { found: boolean; repos: number; builtAt: number | null }
  ripgrep: { repos: number }
  at: number
}

export class VcloakManager {
  private store: VcloakStore
  private config: VcloakConfig
  private loadError: string | undefined
  private secret: Buffer
  private table: AliasTable
  private masker: Masker
  private gateway: VcloakGateway
  private gatewayError: string | null = null
  private scans = new Map<string, Scan>()
  private scanning = new Map<string, Promise<void>>()
  private stats = { requests: 0, blocked: 0 }
  private projectRoots = new TtlCache<boolean>()
  private dirs = new TtlCache<boolean>()
  private dashed = new TtlCache<string[] | null>()
  private saveTimer: NodeJS.Timeout | null = null
  private readonly homeDir: string
  private readonly username: string

  constructor(private opts: ManagerOptions) {
    this.homeDir = opts.homeDir ?? homedir()
    this.username = opts.username ?? userInfo().username
    this.store = new VcloakStore(opts.dir, opts.sealer)
    const { config, error } = this.store.loadConfig()
    this.config = config
    this.loadError = error
    const { secret, entries } = this.store.loadAliases()
    this.secret = secret
    this.table = this.newTable(entries)
    this.masker = new Masker(this.table, this.maskerOptions())
    this.gateway = new VcloakGateway({
      upstream: opts.upstream,
      hooks: {
        mask: (b) => this.masker.maskBody(b),
        unmask: (b) => this.masker.unmaskBody(b),
        unmaskText: (s) => this.masker.unmaskText(s),
        onRequest: (o) => (o === 'blocked' ? this.stats.blocked++ : this.stats.requests++),
      },
    })
  }

  private newTable(entries: ConstructorParameters<typeof AliasTable>[1] = []): AliasTable {
    const table = new AliasTable(this.secret, entries)
    table.onChange = () => this.scheduleSave()
    return table
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.flush()
    }, 1000)
  }

  flush(): void {
    try {
      this.store.saveAliases(this.secret, this.table.entries())
    } catch {
      // next change retries
    }
  }

  private clearFsCaches(): void {
    this.projectRoots.clear()
    this.dirs.clear()
    this.dashed.clear()
  }

  private isDirFs(p: string): boolean {
    return this.dirs.get(p, () => { try { return statSync(p).isDirectory() } catch { return false } })
  }

  // Dash-encoded names (Claude Code project folders) back to real folders
  private resolveDashed(hidden: string, rest: string): string[] | null {
    return this.dashed.get(`${hidden}\0${rest}`, () => {
      let budget = DASH_WALK_BUDGET
      const walk = (dir: string, r: string): string[] | null => {
        if (budget-- <= 0) return null
        let names: string[]
        try {
          names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => d.name)
        } catch {
          // Listing not allowed (macOS privacy rules): guess names from the
          // dashed parts and keep the ones that exist as folders.
          const parts = r.split('-')
          names = []
          for (let k = 1; k <= parts.length; k++) {
            for (const joiner of ['-', '.', '_', ' ']) {
              const name = parts.slice(0, k).join(joiner)
              if (name && !names.includes(name) && this.isDirFs(join(dir, name))) names.push(name)
              if (k === 1) break
            }
          }
        }
        names.sort((a, b) => encSeg(b).length - encSeg(a).length)
        for (const name of names) {
          const e = encSeg(name)
          if (r === e) return [name]
          if (r.startsWith(e + '-')) {
            const sub = walk(join(dir, name), r.slice(e.length + 1))
            if (sub) return [name, ...sub]
          }
        }
        return null
      }
      return walk(hidden, rest)
    })
  }

  private maskerOptions(config = this.config): MaskerOptions {
    return {
      config: this.loadError ? { ...config, enabled: false } : config,
      workspaces: [...this.scans].map(([root, s]) => ({ root, repos: s.repos })),
      homeDir: this.homeDir,
      username: this.username,
      isProjectRoot: (p) => this.projectRoots.get(p, () => existsSync(join(p, '.git'))),
      isDir: (p) => this.isDirFs(p),
      resolveDashed: (h, rest) => this.resolveDashed(h, rest),
    }
  }

  private refreshMasker(): void {
    this.masker.update(this.maskerOptions())
  }

  async init(): Promise<void> {
    if (this.config.enabled && this.opts.sealer.available()) await this.ensureGateway()
  }

  private async ensureGateway(): Promise<void> {
    if (this.gateway.listening) return
    try {
      await this.gateway.start()
      this.gatewayError = null
    } catch (e) {
      this.gatewayError = e instanceof Error ? e.message : 'could not start'
    }
  }

  async dispose(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.flush()
    await this.gateway.stop()
  }

  // Scan a workspace (cached); resolves early after SCAN_WAIT_MS
  async registerWorkspace(cwd: string, force = false): Promise<void> {
    if (!this.config.root) return
    const cached = this.scans.get(cwd)
    if (!force && cached && Date.now() - cached.at < SCAN_TTL_MS) return
    let job = this.scanning.get(cwd)
    if (!job) {
      const root = this.config.root
      job = (async () => {
        const rg = await this.opts.rgPath().catch(() => null)
        const r = await discoverRepos(cwd, root, rg)
        this.scans.set(cwd, { ...r, at: Date.now() })
        this.refreshMasker()
      })().finally(() => this.scanning.delete(cwd))
      this.scanning.set(cwd, job)
    }
    await Promise.race([job, new Promise((r) => setTimeout(r, SCAN_WAIT_MS))])
  }

  // What a new Claude session needs. null = vCloak off, run as before.
  async prepareSpawn(cwd: string): Promise<SpawnCloak> {
    if (!this.config.enabled && !this.loadError) return null
    if (this.loadError) return { ok: false, error: this.loadError }
    const blocked = (error: string): SpawnCloak => (this.config.failClosed ? { ok: false, error } : null)
    if (!this.opts.sealer.available()) return blocked('vCloak needs the macOS Keychain, which is not available.')
    await this.ensureGateway()
    if (!this.gateway.url) return blocked(`vCloak gateway is not running (${this.gatewayError ?? 'unknown error'}).`)
    await this.registerWorkspace(cwd).catch(() => undefined)
    const existing = (process.env.ANTHROPIC_CUSTOM_HEADERS ?? '')
      .split('\n')
      .filter((l) => l.trim() && !l.toLowerCase().startsWith(TOKEN_HEADER))
    return { ok: true, url: this.gateway.url, headers: [...existing, `${TOKEN_HEADER}: ${this.gateway.token}`].join('\n') }
  }

  state(): VcloakState {
    const repos = new Set<string>()
    for (const s of this.scans.values()) for (const r of s.repos) repos.add(r.remote)
    const scans = [...this.scans.values()]
    return {
      config: this.config,
      gateway: { running: this.gateway.listening, port: this.gateway.url ? Number(new URL(this.gateway.url).port) : null, error: this.loadError ?? this.gatewayError },
      encryptionAvailable: this.opts.sealer.available(),
      stats: { requests: this.stats.requests, masked: this.masker.stats.masked, blocked: this.stats.blocked },
      aliasCount: this.table.size,
      sources: {
        graphify: {
          found: scans.some((s) => s.graphify.found),
          repos: scans.reduce((n, s) => n + s.graphify.repos, 0),
          builtAt: scans.reduce<number | null>((t, s) => (s.graphify.builtAt && (!t || s.graphify.builtAt > t) ? s.graphify.builtAt : t), null),
        },
        ripgrep: { repos: scans.reduce((n, s) => n + s.ripgrep.repos, 0) },
        repos: repos.size,
        scannedAt: scans.reduce<number | null>((t, s) => (!t || s.at > t ? s.at : t), null),
        workspaces: [...this.scans.keys()],
      },
    }
  }

  async setConfig(patch: Partial<VcloakConfig>): Promise<VcloakSetConfigResult> {
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'Invalid settings' }
    const allowed: (keyof VcloakConfig)[] = ['enabled', 'mode', 'root', 'exceptions', 'rules', 'maskRoot', 'maskLocalFolders', 'maskUsername', 'hiddenFolders', 'hiddenDecoys', 'failClosed']
    const clean: Partial<VcloakConfig> = {}
    for (const k of allowed) if (k in patch) (clean as Record<string, unknown>)[k] = patch[k]
    if (typeof clean.root === 'string') clean.root = normaliseRoot(clean.root)
    if (Array.isArray(clean.hiddenFolders)) clean.hiddenFolders = clean.hiddenFolders.map((p) => (typeof p === 'string' ? this.normaliseFolder(p) : p))
    if (clean.hiddenDecoys && typeof clean.hiddenDecoys === 'object' && !Array.isArray(clean.hiddenDecoys)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(clean.hiddenDecoys)) {
        if (typeof v !== 'string') return { ok: false, error: 'Invalid hidden folder decoy' }
        if (v.trim() === '') continue
        out[this.normaliseFolder(k)] = this.normaliseFolder(v)
      }
      clean.hiddenDecoys = out
    }
    // Drop decoys of folders no longer hidden
    if (clean.hiddenFolders && !clean.hiddenDecoys) {
      const kept = clean.hiddenFolders
      clean.hiddenDecoys = Object.fromEntries(Object.entries(this.config.hiddenDecoys ?? {}).filter(([k]) => kept.includes(k)))
    }
    // A decoy that exists on disk would make real files look like aliases
    for (const d of Object.values(clean.hiddenDecoys ?? {})) {
      if (existsSync(d)) return { ok: false, error: `Decoy "${d}" exists on this Mac. Pick a made-up path that does not exist.` }
    }
    const root = clean.root ?? this.config.root
    const known = [...this.scans].map(([wsRoot, s]) => ({ root: wsRoot, repos: s.repos }))
    const fix = (v: unknown): { ok: true; value: unknown } | { ok: false; error: string } => {
      if (typeof v !== 'string') return { ok: true, value: v }
      return normaliseRepoInput(v, root, known, this.homeDir)
    }
    if (Array.isArray(clean.exceptions)) {
      const out: unknown[] = []
      for (const e of clean.exceptions) {
        const r = fix(e)
        if (!r.ok) return { ok: false, error: r.error }
        out.push(r.value)
      }
      clean.exceptions = out as string[]
    }
    if (Array.isArray(clean.rules)) {
      const out: unknown[] = []
      for (const rule of clean.rules) {
        if (!rule || typeof rule !== 'object') { out.push(rule); continue }
        const real = fix(rule.real)
        if (!real.ok) return { ok: false, error: real.error }
        const decoy = fix(rule.decoy)
        if (!decoy.ok) return { ok: false, error: decoy.error }
        out.push({ ...rule, real: real.value, decoy: decoy.value })
      }
      clean.rules = out as VcloakConfig['rules']
    }
    const next: VcloakConfig = { ...this.config, ...(this.loadError ? { enabled: false } : {}), ...clean }
    if (next.enabled && !this.opts.sealer.available()) return { ok: false, error: 'vCloak needs the macOS Keychain to store its settings safely, and it is not available.' }
    const remotes = [...this.scans.values()].flatMap((s) => s.repos.map((r) => r.remote))
    const invalid = validateConfig(next, remotes, this.homeDir)
    if (invalid) return { ok: false, error: invalid }
    const rootChanged = next.root !== this.config.root
    try {
      if (this.opts.sealer.available()) this.store.saveConfig(next)
    } catch {
      return { ok: false, error: 'vCloak could not save its settings.' }
    }
    this.config = next
    this.loadError = undefined
    if (rootChanged) this.scans.clear()
    this.clearFsCaches()
    this.refreshMasker()
    if (next.enabled) await this.ensureGateway()
    return { ok: true, state: this.state() }
  }

  // "~/Documents/" -> "/Users/you/Documents"
  private normaliseFolder(p: string): string {
    let s = p.trim()
    if (s === '~' || s.startsWith('~/')) s = this.homeDir.replace(/\/+$/, '') + s.slice(1)
    return s.length > 1 ? s.replace(/\/+$/, '') : s
  }

  preview(text: string): VcloakPreviewResult {
    if (typeof text !== 'string' || text.length > 200_000) return { masked: '', restored: '' }
    const probe = new Masker(this.table, this.maskerOptions({ ...this.config, enabled: true }))
    try {
      const masked = probe.maskText(text)
      return { masked, restored: probe.unmaskText(masked) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed'
      return { masked: msg, restored: '' }
    }
  }

  generateDecoy(real: string): string {
    const root = this.config.root
    const depth = typeof real === 'string' && real.startsWith(root + '/') ? Math.max(1, real.slice(root.length + 1).split('/').length) : 2
    const taken = new Set(this.config.rules.map((r) => r.decoy))
    const remotes = [...this.scans.values()].flatMap((s) => s.repos.map((r) => r.remote))
    for (;;) {
      const decoy = `${root}/${randomWords(depth, randomInt).join('/')}`
      const clash = remotes.some((r) => r === decoy || r.startsWith(decoy + '/') || decoy.startsWith(r + '/'))
      if (!taken.has(decoy) && !clash) return decoy
    }
  }

  // cwd: the project open in the window, so the table fills before any session
  async rescan(cwd?: unknown): Promise<VcloakState> {
    const roots = [...this.scans.keys()]
    if (typeof cwd === 'string' && isAbsolute(cwd) && existsSync(cwd) && statSync(cwd).isDirectory() && !roots.includes(cwd)) roots.push(cwd)
    this.clearFsCaches()
    await Promise.all(roots.map((r) => this.registerWorkspace(r, true)))
    return this.state()
  }

  clearAliases(): VcloakState {
    this.secret = randomBytes(32)
    this.table = this.newTable()
    this.masker = new Masker(this.table, this.maskerOptions())
    this.flush()
    return this.state()
  }

  listRepos(): VcloakRepoRow[] {
    const rows = new Map<string, VcloakRepoRow>()
    for (const [ws, scan] of this.scans) {
      for (const r of scan.repos) {
        if (rows.has(r.remote)) continue
        const alias = this.config.root ? this.masker.aliasGroupPath(r.remote.split('/')) : null
        rows.set(r.remote, { remote: r.remote, local: join(ws, r.rel), alias: alias ? alias.join('/') : null, cloaked: this.masker.shouldMask(r.remote) })
      }
    }
    for (const rule of this.config.rules) {
      if (!rows.has(rule.real)) rows.set(rule.real, { remote: rule.real, local: null, alias: this.config.mode === 'selective' ? rule.decoy : null, cloaked: this.masker.shouldMask(rule.real) })
    }
    return [...rows.values()].sort((a, b) => a.remote.localeCompare(b.remote))
  }

  registerHandlers(ipc: IpcLike): void {
    ipc.handle('vcloak:getState', () => this.state())
    ipc.handle('vcloak:setConfig', (_e, patch) => this.setConfig(patch as Partial<VcloakConfig>))
    ipc.handle('vcloak:preview', (_e, text) => this.preview(text as string))
    ipc.handle('vcloak:generateDecoy', (_e, real) => this.generateDecoy(real as string))
    ipc.handle('vcloak:rescan', (_e, cwd) => this.rescan(cwd))
    ipc.handle('vcloak:clearAliases', () => this.clearAliases())
    ipc.handle('vcloak:listRepos', () => this.listRepos())
  }
}
