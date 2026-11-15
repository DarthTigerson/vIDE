// Pure validation of the vSuite Store catalog (`registry.json`, served from
// vsuite.tech). Kept free of Electron imports so it unit-tests in plain node.
// Spec: docs/superpowers/specs/2026-11-15-vsuite-store-design.md

export const REGISTRY_SCHEMA = 1

export interface StoreRelease {
  version: string
  commit: string
  url: string
  sha256: string
  minVide: string
  notesUrl?: string
}

export interface StoreApp {
  id: string
  name: string
  description: string
  repo: string
  firstParty: true
  latest: StoreRelease
  replacesBuiltIn?: string
  // Store-page metadata, shared with vsuite.tech. Defaults keep older
  // registry entries (without these fields) listable.
  recommended: boolean
  category: string
  targets: string[]
  // Optional page assets and facts (https only). A bad one is dropped alone;
  // the entry stays listable.
  icon?: string
  screenshots?: string[]
  readmeUrl?: string
  size?: number
  publishedAt?: string
}

export const MAX_SCREENSHOTS = 8
export const DEFAULT_CATEGORY = 'applications'
export const DEFAULT_TARGETS = ['vide']

export type ParsedRegistry =
  | { kind: 'ok'; apps: StoreApp[] }
  | { kind: 'too-new' }
  | { kind: 'invalid'; reason: string }

export const ID_RE = /^[a-z0-9-]+$/
export const SEMVER_RE = /^\d+\.\d+\.\d+$/
const COMMIT_RE = /^[0-9a-f]{40}$/
const SHA256_RE = /^[0-9a-f]{64}$/
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://')
}

// Optional fields, each judged alone: a bad one is left out, never the entry.
function parseOptionalFields(raw: Record<string, unknown>): Partial<StoreApp> {
  const out: Partial<StoreApp> = {}
  if (isHttpsUrl(raw.icon)) out.icon = raw.icon
  if (Array.isArray(raw.screenshots) && raw.screenshots.length <= MAX_SCREENSHOTS && raw.screenshots.every(isHttpsUrl)) {
    if (raw.screenshots.length > 0) out.screenshots = [...(raw.screenshots as string[])]
  }
  if (isHttpsUrl(raw.readmeUrl)) out.readmeUrl = raw.readmeUrl
  if (typeof raw.size === 'number' && Number.isInteger(raw.size) && raw.size >= 0) out.size = raw.size
  if (typeof raw.publishedAt === 'string' && !Number.isNaN(Date.parse(raw.publishedAt))) out.publishedAt = raw.publishedAt
  return out
}

function parseRelease(raw: unknown): StoreRelease | string {
  if (!isObject(raw)) return 'latest missing'
  const { version, commit, url, sha256, minVide, notesUrl } = raw
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) return 'bad latest.version'
  if (typeof commit !== 'string' || !COMMIT_RE.test(commit)) return 'bad latest.commit'
  if (!isHttpsUrl(url)) return 'bad latest.url'
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) return 'bad latest.sha256'
  if (typeof minVide !== 'string' || !SEMVER_RE.test(minVide)) return 'bad latest.minVide'
  if (notesUrl !== undefined && !isHttpsUrl(notesUrl)) return 'bad latest.notesUrl'
  const release: StoreRelease = { version, commit, url, sha256, minVide }
  if (notesUrl !== undefined) release.notesUrl = notesUrl
  return release
}

function parseApp(raw: unknown): StoreApp | string {
  if (!isObject(raw)) return 'not an object'
  const { id, name, description, repo, firstParty, latest, replacesBuiltIn, recommended, category, targets } = raw
  if (typeof id !== 'string' || !ID_RE.test(id)) return 'bad id'
  if (!nonEmptyString(name)) return 'bad name'
  if (!nonEmptyString(description)) return 'bad description'
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) return 'bad repo'
  // Phase 1 lists only apps made by the vIDE project.
  if (firstParty !== true) return 'not first-party'
  if (replacesBuiltIn !== undefined && (typeof replacesBuiltIn !== 'string' || !ID_RE.test(replacesBuiltIn))) {
    return 'bad replacesBuiltIn'
  }
  if (recommended !== undefined && typeof recommended !== 'boolean') return 'bad recommended'
  if (category !== undefined && (typeof category !== 'string' || !ID_RE.test(category))) return 'bad category'
  if (targets !== undefined && (!Array.isArray(targets) || !targets.every((t) => typeof t === 'string' && ID_RE.test(t)))) {
    return 'bad targets'
  }
  const release = parseRelease(latest)
  if (typeof release === 'string') return release
  const app: StoreApp = {
    id, name, description, repo, firstParty: true, latest: release,
    recommended: recommended === true,
    category: category ?? DEFAULT_CATEGORY,
    targets: targets ? [...targets] : [...DEFAULT_TARGETS],
  }
  if (replacesBuiltIn !== undefined) app.replacesBuiltIn = replacesBuiltIn
  Object.assign(app, parseOptionalFields(raw))
  return app
}

export function parseRegistry(raw: unknown): ParsedRegistry {
  if (!isObject(raw)) return { kind: 'invalid', reason: 'not a JSON object' }
  if (typeof raw.schema !== 'number' || !Number.isInteger(raw.schema)) {
    return { kind: 'invalid', reason: 'missing schema' }
  }
  if (raw.schema > REGISTRY_SCHEMA) return { kind: 'too-new' }
  if (raw.schema < REGISTRY_SCHEMA) return { kind: 'invalid', reason: `unsupported schema ${raw.schema}` }
  if (!Array.isArray(raw.apps)) return { kind: 'invalid', reason: 'apps is not a list' }

  const apps: StoreApp[] = []
  const seen = new Set<string>()
  for (const item of raw.apps) {
    const parsed = parseApp(item)
    const id = isObject(item) && typeof item.id === 'string' ? item.id : '?'
    if (typeof parsed === 'string') {
      console.warn('[store] dropped entry', id, parsed)
      continue
    }
    if (seen.has(parsed.id)) {
      console.warn('[store] dropped entry', parsed.id, 'duplicate id')
      continue
    }
    seen.add(parsed.id)
    apps.push(parsed)
  }
  apps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return { kind: 'ok', apps }
}
