import { ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { compareVersions } from './updateChecker'
import { parseRegistry, type StoreApp } from './storeRegistry'
import type { LanguageServerEntry } from './lsp/catalog'

// The vSuite Store catalog. VIDE_STORE_REGISTRY_URL points a dev build at a
// local file server before vsuite.tech is live (or to test a draft catalog).
export const DEFAULT_REGISTRY_URL = 'https://vsuite.tech/registry.json'
const FETCH_TIMEOUT_MS = 10_000
const README_TIMEOUT_MS = 10_000
const README_MAX_BYTES = 512 * 1024

// `compatible` is false when the app needs a newer vIDE than this one
// (latest.minVide > app version), so the renderer never compares versions.
export type StoreListing = StoreApp & { compatible: boolean }

export type ReadmeResult = { ok: true; text: string } | { ok: false }

export type RegistryState =
  | { status: 'ok'; apps: StoreListing[]; languageServers: LanguageServerEntry[]; checkedAt: number; fromCache: boolean }
  | { status: 'empty'; checkedAt: number }
  | { status: 'too-new' }
  | { status: 'error'; message: string }

interface CacheFile {
  checkedAt: number
  registry: unknown
}

export interface StoreServiceOptions {
  url: string
  // userData/apps/registry-cache.json — per machine, never synced.
  cacheFile: string
  currentVersion: string
  fetchFn?: typeof fetch
}

// What a refresh must change for the renderer to care: the status and each
// app's id + latest version (checkedAt/fromCache alone are not news).
function signature(state: RegistryState | null): string {
  if (!state) return 'none'
  if (state.status !== 'ok') return state.status
  return 'ok:' + state.apps.map((a) => `${a.id}@${a.latest.version}:${a.compatible}`).join(',') +
    '|' + state.languageServers.map((l) => l.id).join(',')
}

// Reads a response body as text, or null once it passes `max` bytes.
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) {
    const text = await res.text()
    return Buffer.byteLength(text) > max ? null : text
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      void reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export class StoreService {
  private memory: RegistryState | null = null
  private inFlight: Promise<RegistryState> | null = null
  // README text per app + version, for this session only.
  private readonly readmes = new Map<string, string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly fetchFn: typeof fetch

  constructor(private readonly opts: StoreServiceOptions) {
    this.fetchFn = opts.fetchFn ?? fetch
  }

  // refresh=false returns the session's last result when there is one;
  // refresh=true always goes to the network. Concurrent calls share a fetch.
  getRegistry(refresh: boolean): Promise<RegistryState> {
    if (!refresh && this.memory) return Promise.resolve(this.memory)
    if (this.inFlight) return this.inFlight
    this.inFlight = this.load().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  // Re-fetches the catalog on a timer (default 6 h) and calls onChanged only
  // when the result differs (status, app ids or versions), so the renderer
  // reloads and update notices appear without the Store tab being open.
  startPeriodicRefresh(intervalMs = 6 * 60 * 60 * 1000, onChanged?: () => void): void {
    this.stopPeriodicRefresh()
    this.timer = setInterval(() => {
      const before = signature(this.memory)
      void this.getRegistry(true).then((after) => {
        if (signature(after) !== before) onChanged?.()
      }).catch(() => {})
    }, intervalMs)
    this.timer.unref?.()
  }

  stopPeriodicRefresh(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  registerHandlers(): void {
    ipcMain.handle('store:getRegistry', (_e, refresh: boolean) => this.getRegistry(!!refresh))
    ipcMain.handle('store:getReadme', (_e, id: string) => this.getReadme(String(id)))
  }

  // The app's README (from the catalog's readmeUrl), fetched here rather than
  // in the renderer so it is size- and time-limited. Cached per app+version.
  async getReadme(id: string): Promise<ReadmeResult> {
    const state = this.memory ?? (await this.getRegistry(false))
    if (state.status !== 'ok') return { ok: false }
    const app = state.apps.find((a) => a.id === id)
    if (!app?.readmeUrl) return { ok: false }
    const key = `${app.id}@${app.latest.version}`
    const cached = this.readmes.get(key)
    if (cached !== undefined) return { ok: true, text: cached }
    try {
      const res = await this.fetchFn(app.readmeUrl, {
        headers: { Accept: 'text/markdown, text/plain' },
        signal: AbortSignal.timeout(README_TIMEOUT_MS),
      })
      if (!res.ok) return { ok: false }
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > README_MAX_BYTES) return { ok: false }
      const text = await readCapped(res, README_MAX_BYTES)
      if (text === null) return { ok: false }
      this.readmes.set(key, text)
      return { ok: true, text }
    } catch {
      return { ok: false }
    }
  }

  private async load(): Promise<RegistryState> {
    const state = await this.fetchRemote()
    this.memory = state
    return state
  }

  private async fetchRemote(): Promise<RegistryState> {
    let res: Response
    try {
      res = await this.fetchFn(this.opts.url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (e) {
      console.error('[store] catalog fetch failed:', e)
      return this.fromCacheOr("Couldn't reach the Store. Check your connection.")
    }

    // The catalog repo not being published yet is an empty store, not an error.
    if (res.status === 404) return { status: 'empty', checkedAt: Date.now() }
    if (!res.ok) return this.fromCacheOr(`The Store answered with an error (HTTP ${res.status}).`)

    let raw: unknown
    try {
      raw = JSON.parse(await res.text())
    } catch {
      return this.fromCacheOr('The Store sent a catalog vIDE could not read.')
    }

    const checkedAt = Date.now()
    const state = this.toState(raw, checkedAt, false)
    if (state.status === 'ok' || state.status === 'empty') {
      await this.writeCache({ checkedAt, registry: raw })
    } else if (state.status === 'error') {
      return this.fromCacheOr(state.message)
    }
    return state
  }

  private toState(raw: unknown, checkedAt: number, fromCache: boolean): RegistryState {
    const parsed = parseRegistry(raw)
    if (parsed.kind === 'too-new') return { status: 'too-new' }
    if (parsed.kind === 'invalid') {
      console.warn('[store] invalid catalog:', parsed.reason)
      return { status: 'error', message: 'The Store sent a catalog vIDE could not read.' }
    }
    if (parsed.apps.length === 0 && parsed.languageServers.length === 0) return { status: 'empty', checkedAt }
    const apps = parsed.apps.map((app) => ({
      ...app,
      compatible: compareVersions(this.opts.currentVersion, app.latest.minVide) >= 0,
    }))
    return { status: 'ok', apps, languageServers: parsed.languageServers, checkedAt, fromCache }
  }

  private async fromCacheOr(message: string): Promise<RegistryState> {
    const cache = await this.readCache()
    if (cache) {
      const state = this.toState(cache.registry, cache.checkedAt, true)
      if (state.status === 'ok') return state
    }
    return { status: 'error', message }
  }

  private async readCache(): Promise<CacheFile | null> {
    try {
      const parsed = JSON.parse(await readFile(this.opts.cacheFile, 'utf8')) as CacheFile
      return typeof parsed?.checkedAt === 'number' ? parsed : null
    } catch {
      return null
    }
  }

  private async writeCache(cache: CacheFile): Promise<void> {
    try {
      await mkdir(dirname(this.opts.cacheFile), { recursive: true })
      await writeFile(this.opts.cacheFile, JSON.stringify(cache))
    } catch (e) {
      console.error('[store] could not write catalog cache:', e)
    }
  }
}
