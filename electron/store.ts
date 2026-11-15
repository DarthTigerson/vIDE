import { ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { compareVersions } from './updateChecker'
import { parseRegistry, type StoreApp } from './storeRegistry'

// The vSuite Store catalog. VIDE_STORE_REGISTRY_URL points a dev build at a
// local file server before vsuite.tech is live (or to test a draft catalog).
export const DEFAULT_REGISTRY_URL = 'https://vsuite.tech/registry.json'
const FETCH_TIMEOUT_MS = 10_000

// `compatible` is false when the app needs a newer vIDE than this one
// (latest.minVide > app version), so the renderer never compares versions.
export type StoreListing = StoreApp & { compatible: boolean }

export type RegistryState =
  | { status: 'ok'; apps: StoreListing[]; checkedAt: number; fromCache: boolean }
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
  return 'ok:' + state.apps.map((a) => `${a.id}@${a.latest.version}:${a.compatible}`).join(',')
}

export class StoreService {
  private memory: RegistryState | null = null
  private inFlight: Promise<RegistryState> | null = null
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
    if (parsed.apps.length === 0) return { status: 'empty', checkedAt }
    const apps = parsed.apps.map((app) => ({
      ...app,
      compatible: compareVersions(this.opts.currentVersion, app.latest.minVide) >= 0,
    }))
    return { status: 'ok', apps, checkedAt, fromCache }
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
