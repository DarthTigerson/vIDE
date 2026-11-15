// Downloads, verifies, installs, updates and uninstalls store app packages.
// Layout: <appsDir>/<id>/<version>/ plus <appsDir>/installed.json. A new
// version is fully in place before the old folder is touched.

import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { compareVersions } from '../updateChecker'
import type { StoreApp } from '../storeRegistry'
import { APP_API_VERSION, parseManifest } from './appManifest'
import { extractZip } from './extractZip'
import { readInstalled, writeInstalled, type InstalledRecord } from './installedApps'

export interface InstallerOptions {
  appsDir: string
  currentVersion: string
  fetchFn?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

export type InstallResult =
  | { ok: true; record: InstalledRecord; previous?: InstalledRecord }
  | { ok: false; error: string }

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024

const ERR_DOWNLOAD = "Couldn't download the app. Check your connection."
const ERR_CHECKSUM = 'Download did not match the Store checksum.'
const ERR_MISMATCH = 'Package does not match the Store listing.'
const ERR_INVALID = 'The downloaded package is not a valid app.'
const ERR_TOO_BIG = 'The download is larger than an app may be.'

class DownloadError extends Error {}

export class AppInstaller {
  private readonly appsDir: string
  private readonly currentVersion: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number
  private readonly maxBytes: number

  constructor(opts: InstallerOptions) {
    this.appsDir = opts.appsDir
    this.currentVersion = opts.currentVersion
    this.fetchFn = opts.fetchFn ?? fetch
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  }

  installDir(id: string, version: string): string {
    return join(this.appsDir, id, version)
  }

  async install(app: StoreApp): Promise<InstallResult> {
    if (app.firstParty !== true) return { ok: false, error: 'Only apps made by vSuite can be installed.' }
    if (compareVersions(app.latest.minVide, this.currentVersion) > 0) {
      return { ok: false, error: `Needs vIDE ${app.latest.minVide} or newer.` }
    }

    const tmpRoot = join(this.appsDir, '.tmp')
    const tmp = join(tmpRoot, `${app.id}-${randomBytes(6).toString('hex')}`)
    try {
      let zip: Uint8Array
      try {
        zip = await this.download(app.latest.url)
      } catch (e) {
        return { ok: false, error: e instanceof DownloadError && e.message === ERR_TOO_BIG ? ERR_TOO_BIG : ERR_DOWNLOAD }
      }
      const digest = createHash('sha256').update(zip).digest('hex')
      if (digest !== app.latest.sha256.toLowerCase()) return { ok: false, error: ERR_CHECKSUM }

      mkdirSync(tmp, { recursive: true })
      try {
        extractZip(zip, tmp)
      } catch {
        return { ok: false, error: ERR_INVALID }
      }
      let manifestJson: unknown
      try {
        manifestJson = JSON.parse(readFileSync(join(tmp, 'manifest.json'), 'utf8'))
      } catch {
        return { ok: false, error: ERR_INVALID }
      }
      const manifest = parseManifest(manifestJson)
      if (typeof manifest === 'string') return { ok: false, error: ERR_INVALID }
      if (manifest.id !== app.id || manifest.version !== app.latest.version) {
        return { ok: false, error: ERR_MISMATCH }
      }
      if (manifest.apiVersion !== APP_API_VERSION) {
        return { ok: false, error: 'Built for a newer vIDE. Update vIDE first.' }
      }
      if (!existsSync(join(tmp, manifest.renderer))) return { ok: false, error: ERR_INVALID }
      if (manifest.main !== undefined && !existsSync(join(tmp, manifest.main))) {
        return { ok: false, error: ERR_INVALID }
      }

      const target = this.installDir(app.id, app.latest.version)
      mkdirSync(join(this.appsDir, app.id), { recursive: true })
      // Move any existing copy of this version aside rather than deleting it,
      // so a failure below can restore it.
      const aside = existsSync(target) ? `${target}.old-${randomBytes(6).toString('hex')}` : undefined
      if (aside) renameSync(target, aside)
      renameSync(tmp, target)

      const records = readInstalled(this.appsDir)
      const previous = records.find((r) => r.id === app.id)
      const record: InstalledRecord = {
        id: app.id,
        version: app.latest.version,
        commit: app.latest.commit,
        installedAt: Date.now()
      }
      try {
        writeInstalled(this.appsDir, [...records.filter((r) => r.id !== app.id), record])
      } catch {
        rmSync(target, { recursive: true, force: true })
        if (aside) renameSync(aside, target)
        return { ok: false, error: ERR_INVALID }
      }
      if (aside) rmSync(aside, { recursive: true, force: true })
      if (previous && previous.version !== record.version) {
        rmSync(this.installDir(app.id, previous.version), { recursive: true, force: true })
      }
      return previous ? { ok: true, record, previous } : { ok: true, record }
    } catch {
      return { ok: false, error: ERR_INVALID }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  uninstall(id: string): { ok: true } | { ok: false; error: string } {
    const records = readInstalled(this.appsDir)
    if (!records.some((r) => r.id === id)) return { ok: false, error: 'Not installed.' }
    try {
      rmSync(join(this.appsDir, id), { recursive: true, force: true })
      writeInstalled(this.appsDir, records.filter((r) => r.id !== id))
      return { ok: true }
    } catch {
      return { ok: false, error: "Couldn't remove the app." }
    }
  }

  private async download(url: string): Promise<Uint8Array> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchFn(url, { signal: controller.signal })
      if (!res.ok) throw new DownloadError('http')
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > this.maxBytes) throw new DownloadError(ERR_TOO_BIG)
      if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.byteLength > this.maxBytes) throw new DownloadError(ERR_TOO_BIG)
        return buf
      }
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > this.maxBytes) {
          void reader.cancel()
          throw new DownloadError(ERR_TOO_BIG)
        }
        chunks.push(value)
      }
      const out = new Uint8Array(total)
      let offset = 0
      for (const c of chunks) { out.set(c, offset); offset += c.byteLength }
      return out
    } finally {
      clearTimeout(timer)
    }
  }
}
