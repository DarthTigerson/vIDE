// "Install from file": inspecting a package zip picked from disk and holding
// its bytes between the summary the user confirms and the install itself.
// No Electron imports, so it unit-tests in plain node.

import { createHash, randomBytes } from 'crypto'
import { unzipSync } from 'fflate'
import type { StoreApp } from '../storeRegistry'
import { compareVersions } from '../updateChecker'
import { APP_API_VERSION, parseManifest } from './appManifest'

export interface FileSummary {
  token: string
  id: string
  name: string
  version: string
  // data: URL of the manifest icon, when it is a small image.
  icon?: string
  // The catalog's latest release for this id has the same sha256.
  matchesStore: boolean
}

export type InspectResult =
  | { ok: true; summary: Omit<FileSummary, 'token'>; sha256: string }
  | { ok: false; error: string }

const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_ICON_BYTES = 200 * 1024
const ICON_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
}

const ERR_INVALID = 'That file is not a valid vSuite app package.'

// Reads manifest.json (and the icon) from the zip without extracting it.
// `listing` is the catalog entry for the package's id, if any.
export async function inspectPackage(
  zip: Uint8Array,
  ctx: { currentVersion: string; listingFor: (id: string) => Promise<StoreApp | null> },
): Promise<InspectResult> {
  const sha256 = createHash('sha256').update(zip).digest('hex')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zip, {
      filter: (f) => f.name === 'manifest.json' && f.originalSize <= MAX_MANIFEST_BYTES,
    })
  } catch {
    return { ok: false, error: ERR_INVALID }
  }
  const raw = files['manifest.json']
  if (!raw) return { ok: false, error: ERR_INVALID }
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return { ok: false, error: ERR_INVALID }
  }
  const manifest = parseManifest(json)
  if (typeof manifest === 'string') return { ok: false, error: ERR_INVALID }
  if (manifest.apiVersion !== APP_API_VERSION) return { ok: false, error: 'Built for a newer vIDE. Update vIDE first.' }
  if (compareVersions(manifest.minVide, ctx.currentVersion) > 0) {
    return { ok: false, error: `Needs vIDE ${manifest.minVide} or newer.` }
  }

  let icon: string | undefined
  const ext = manifest.icon?.split('.').pop()?.toLowerCase() ?? ''
  if (manifest.icon && ICON_TYPES[ext]) {
    try {
      const iconPath = manifest.icon
      const picked = unzipSync(zip, { filter: (f) => f.name === iconPath && f.originalSize <= MAX_ICON_BYTES })
      const bytes = picked[iconPath]
      if (bytes) icon = `data:${ICON_TYPES[ext]};base64,${Buffer.from(bytes).toString('base64')}`
    } catch { /* no icon is fine */ }
  }

  const listing = await ctx.listingFor(manifest.id)
  const matchesStore = !!listing && listing.latest.sha256.toLowerCase() === sha256
  return {
    ok: true,
    sha256,
    summary: { id: manifest.id, name: manifest.name, version: manifest.version, ...(icon ? { icon } : {}), matchesStore },
  }
}

export interface HeldPackage {
  zip: Uint8Array
  id: string
  name: string
  version: string
  matchesStore: boolean
}

// One-shot, expiring hold on inspected package bytes. A token is consumed by
// `take`, so a confirm can never be replayed.
export class PackageHolder {
  private readonly held = new Map<string, { pkg: HeldPackage; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  hold(pkg: HeldPackage): string {
    // Only the latest inspected package stays held.
    for (const token of [...this.held.keys()]) this.discard(token)
    const token = randomBytes(16).toString('hex')
    const timer = setTimeout(() => this.held.delete(token), this.ttlMs)
    timer.unref?.()
    this.held.set(token, { pkg, timer })
    return token
  }

  take(token: string): HeldPackage | null {
    const entry = this.held.get(token)
    if (!entry) return null
    this.discard(token)
    return entry.pkg
  }

  discard(token: string): void {
    const entry = this.held.get(token)
    if (!entry) return
    clearTimeout(entry.timer)
    this.held.delete(token)
  }
}
