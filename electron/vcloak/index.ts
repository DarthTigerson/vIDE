import { randomBytes, randomInt } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { homedir, userInfo } from 'os'
import { isAbsolute, join } from 'path'
import { AliasTable, Masker, randomWords, VcloakLeakError, type LocalRepo, type MaskerOptions } from './masker'
import { normaliseRepoInput, normaliseRoot } from './normalise'
import { VcloakGateway, TOKEN_HEADER } from './gateway'
import { discoverRepos } from './sources'
import { WordChecker } from './dictionary'
import { validateConfig, VcloakStore, type Sealer } from './store'
import type { VcloakConfig, VcloakPreviewResult, VcloakRepoRow, VcloakSetConfigResult, VcloakState } from './types'

export type SpawnCloak = null | { ok: true; url: string; headers: string } | { ok: false; error: string }

// Masking for in-process callers (vIDE Bridge). maskBody throws when a body
// cannot be masked safely; the caller must then not send it.
export interface TextCloak {
  maskBody<T>(body: T): T
  unmaskText(s: string): string
}
export type BridgeCloak = null | { ok: true; cloak: TextCloak } | { ok: false; error: string }

// Runs the real Codex CLI with its OpenAI base URL pointed at vCloak.
// Placed first on PATH in vIDE terminals; finds the real codex further on.
const CODEX_WRAPPER = `#!/bin/sh
# vIDE vCloak: runs the real Codex CLI through the local vCloak gateway.
self_dir=$(cd "$(dirname "$0")" && pwd)
real=""
old_ifs=$IFS
IFS=:
for d in $PATH; do
  [ "$d" = "$self_dir" ] && continue
  if [ -x "$d/codex" ]; then real="$d/codex"; break; fi
done
IFS=$old_ifs
if [ -z "$real" ]; then echo "codex: command not found" >&2; exit 127; fi
if [ -n "$VIDE_VCLOAK_OPENAI_URL" ]; then
  exec "$real" -c "openai_base_url=\\"$VIDE_VCLOAK_OPENAI_URL\\"" "$@"
fi
exec "$real" "$@"
`

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
  // Word list for hidePlainNames; defaults to the macOS system list
  wordsPath?: string
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
  private paths = new TtlCache<boolean>()
  private listings = new TtlCache<string[]>()
  private dashed = new TtlCache<string[] | null>()
  private saveTimer: NodeJS.Timeout | null = null
  private readonly homeDir: string
  private readonly words: WordChecker
  private readonly username: string

  constructor(private opts: ManagerOptions) {
    this.homeDir = opts.homeDir ?? homedir()
    this.words = new WordChecker(opts.wordsPath)
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
        onMaskError: (err) => this.recordBlock(err),
      },
    })
  }

  // Why the last request was blocked, kept on this Mac only (owner-readable).
  // It can hold real names, so it never goes into logs that leave the machine.
  private recordBlock(err: unknown): void {
    try {
      const e = err instanceof Error ? err : new Error(String(err))
      const detail = e instanceof VcloakLeakError ? e.detail : ''
      const text = `${new Date().toISOString()}\n${e.name}: ${e.message}\n${detail}\n${e.stack ?? ''}\n`
      mkdirSync(this.opts.dir, { recursive: true })
      writeFileSync(join(this.opts.dir, 'last-block.txt'), text, { mode: 0o600 })
      chmodSync(join(this.opts.dir, 'last-block.txt'), 0o600)
      // The text that failed, to replay the problem offline (capped at 1 MB)
      const input = e instanceof VcloakLeakError ? e.input.slice(0, 1_000_000) : ''
      writeFileSync(join(this.opts.dir, 'last-block-input.txt'), input, { mode: 0o600 })
      chmodSync(join(this.opts.dir, 'last-block-input.txt'), 0o600)
    } catch {
      // diagnostics are best effort
    }
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
    this.paths.clear()
    this.listings.clear()
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
      exists: (p) => this.paths.get(p, () => existsSync(p)),
      listDir: (p) => this.listings.get(p, () => { try { return readdirSync(p).filter((n) => !n.startsWith('.')) } catch { return [] } }),
      resolveDashed: (h, rest) => this.resolveDashed(h, rest),
      isWord: (n) => this.words.isWord(n),
    }
  }

  private refreshMasker(): void {
    this.masker.update(this.maskerOptions())
  }

  async init(): Promise<void> {
    if (this.config.enabled && this.opts.sealer.available()) await this.ensureGateway()
    try { this.writeCodexWrapper() } catch { /* terminals then run codex unwrapped */ }
  }

  private get binDir(): string {
    return join(this.opts.dir, 'bin')
  }

  private writeCodexWrapper(): void {
    mkdirSync(this.binDir, { recursive: true, mode: 0o700 })
    chmodSync(this.binDir, 0o700)
    const file = join(this.binDir, 'codex')
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, CODEX_WRAPPER, { mode: 0o700 })
    renameSync(tmp, file)
    chmodSync(file, 0o700)
  }

  // Masking for vIDE Bridge requests. null = send as is.
  async forBridge(cwd?: string): Promise<BridgeCloak> {
    if (!this.config.enabled || !this.config.coverBridge) return null
    const blocked = (error: string): BridgeCloak => (this.config.failClosed ? { ok: false, error } : null)
    if (this.loadError) return blocked(this.loadError)
    if (!this.opts.sealer.available()) return blocked('vCloak needs the macOS Keychain, which is not available.')
    if (cwd && isAbsolute(cwd)) await this.registerWorkspace(cwd).catch(() => undefined)
    return {
      ok: true,
      cloak: {
        maskBody: <T>(body: T): T => {
          try {
            const out = this.masker.maskBody(body)
            this.stats.requests++
            return out
          } catch (e) {
            this.stats.blocked++
            throw e
          }
        },
        unmaskText: (s: string) => this.masker.unmaskText(s),
      },
    }
  }

  // Extra environment for a new vIDE terminal. Empty when vCloak is off or
  // its gateway is not running. A shell profile that sets the same variables
  // wins over these.
  terminalEnv(): Record<string, string> {
    if (!this.config.enabled || !this.config.coverTerminals || this.loadError || !this.gateway.listening) return {}
    const anthropic = this.gateway.routeUrl('anthropic')
    const openai = this.gateway.routeUrl('openai')
    const codeAssist = this.gateway.routeUrl('codeassist')
    if (!anthropic || !openai || !codeAssist) return {}
    const env: Record<string, string> = {
      VIDE_VCLOAK: '1',
      ANTHROPIC_BASE_URL: anthropic,
      CODE_ASSIST_ENDPOINT: codeAssist,
    }
    // Leave a base URL the user set for another provider alone
    if (!process.env.OPENAI_BASE_URL) env.OPENAI_BASE_URL = `${openai}/v1`
    if (this.config.coverCodex && existsSync(join(this.binDir, 'codex'))) {
      env.VIDE_VCLOAK_OPENAI_URL = `${openai}/v1`
      env.PATH = `${this.binDir}:${process.env.PATH ?? '/usr/bin:/bin'}`
    }
    return env
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
    if (this.config.roots.length === 0) return
    const cached = this.scans.get(cwd)
    if (!force && cached && Date.now() - cached.at < SCAN_TTL_MS) return
    let job = this.scanning.get(cwd)
    if (!job) {
      const roots = this.config.roots
      job = (async () => {
        const rg = await this.opts.rgPath().catch(() => null)
        const r = await discoverRepos(cwd, roots, rg)
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
      hiddenStatus: this.config.hiddenFolders.map((p) => {
        try {
          return { path: p, listed: true, count: readdirSync(p).filter((n) => !n.startsWith('.')).length }
        } catch {
          return { path: p, listed: false, count: 0 }
        }
      }),
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
    const allowed: (keyof VcloakConfig)[] = ['enabled', 'mode', 'roots', 'exceptions', 'rules', 'maskRoot', 'maskLocalFolders', 'maskUsername', 'hidePlainNames', 'hiddenFolders', 'hiddenDecoys', 'hiddenDepth', 'failClosed', 'coverBridge', 'coverTerminals', 'coverCodex']
    // Old single "root" patch: one GitLab group (empty clears the list)
    const legacy = (patch as { root?: unknown }).root
    if (typeof legacy === 'string' && !('roots' in patch)) {
      const path = normaliseRoot(legacy)
      patch = { ...patch, roots: path ? [{ path, host: 'gitlab' }] : [] }
    }
    const clean: Partial<VcloakConfig> = {}
    for (const k of allowed) if (k in patch) (clean as Record<string, unknown>)[k] = patch[k]
    if (Array.isArray(clean.roots)) {
      clean.roots = clean.roots.map((r) => (r && typeof r === 'object' && typeof r.path === 'string' ? { path: normaliseRoot(r.path), host: r.host } : r))
    }
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
    const roots = clean.roots ?? this.config.roots
    const known = [...this.scans].map(([wsRoot, s]) => ({ root: wsRoot, repos: s.repos }))
    const fix = (v: unknown): { ok: true; value: unknown } | { ok: false; error: string } => {
      if (typeof v !== 'string') return { ok: true, value: v }
      return normaliseRepoInput(v, roots, known, this.homeDir)
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
    const rootChanged = JSON.stringify(next.roots) !== JSON.stringify(this.config.roots)
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
    const roots = this.config.roots
    const path = typeof real === 'string' ? real : ''
    const root = roots.filter((r) => path.startsWith(r.path + '/')).sort((a, b) => b.path.length - a.path.length)[0] ?? roots[0]
    if (!root) return ''
    // GitHub and similar hosts: owner/repo, so one made-up segment
    const depth = root.host !== 'gitlab' ? 1 : path.startsWith(root.path + '/') ? Math.max(1, path.slice(root.path.length + 1).split('/').length) : 2
    const taken = new Set(this.config.rules.map((r) => r.decoy))
    const remotes = [...this.scans.values()].flatMap((s) => s.repos.map((r) => r.remote))
    for (;;) {
      const decoy = `${root.path}/${randomWords(depth, randomInt).join('/')}`
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
        const alias = this.config.roots.length > 0 ? this.masker.aliasGroupPath(r.remote.split('/')) : null
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
