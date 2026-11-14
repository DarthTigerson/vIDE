import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig, type VcloakHost, type VcloakMode } from './types'

// Encrypted on-disk state under userData/vcloak (dir 0700, files 0600).
// Sealing uses Electron safeStorage (macOS Keychain). A file that exists but
// cannot be opened is treated as tampered: vCloak reports an error and new
// Claude sessions are refused until the settings are saved again.

export interface Sealer {
  available(): boolean
  seal(plain: string): Buffer
  open(sealed: Buffer): string
}

type AliasEntry = ['c' | 'l' | 'h' | 'w', string, string]

const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/
const MODES: VcloakMode[] = ['all', 'all-except', 'selective']
const HOSTS: VcloakHost[] = ['gitlab', 'github', 'other']
const MAX_ROOTS = 20
const MAX_ITEMS = 500
const MAX_HIDDEN = 50
const HIDDEN_SEG_RE = /^[A-Za-z0-9_.-]+$/
// Too broad to hide: filesystem root, /Users, /home, and a home folder itself
const BROAD_HIDDEN_RE = /^\/(?:Users|home)(?:\/[^/]+)?$/

// Returns an error message or null for the hidden folder list
function validateHidden(list: unknown, homeDir?: string): string | null {
  if (!Array.isArray(list)) return 'Invalid hidden folders'
  if (list.length > MAX_HIDDEN) return `At most ${MAX_HIDDEN} hidden folders`
  for (const p of list) {
    if (typeof p !== 'string' || !p.startsWith('/')) return `Hidden folder "${String(p)}" must be an absolute path such as /Users/you/Documents`
    const segs = p.split('/').slice(1)
    if (p !== '/' && (p.endsWith('/') || segs.some((s) => s === '' || s === '.' || s === '..'))) return `Hidden folder "${p}" must be a clean path without "..", "." or double slashes`
    if (p === '/' || BROAD_HIDDEN_RE.test(p) || (homeDir && isUnder(p, homeDir))) return `Hidden folder "${p}" is too broad. Pick a folder inside your home folder, such as /Users/you/Documents`
    if (!segs.every((s) => HIDDEN_SEG_RE.test(s))) return `Hidden folder "${p}" has spaces or special characters in its name, which are not supported yet`
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (isUnder(list[i], list[j]) || isUnder(list[j], list[i])) return list[i] === list[j] ? `Hidden folder "${list[i]}" is listed twice` : `Hidden folders "${list[i]}" and "${list[j]}" overlap`
    }
  }
  return null
}

const encPath = (p: string) => p.replace(/[^A-Za-z0-9]/g, '-')

// Decoys for hidden folders: absolute, clean, unique, and never overlapping a
// hidden folder (as a path or in Claude's dash-encoded folder form)
function validateHiddenDecoys(decoys: unknown, hidden: string[], homeDir?: string): string | null {
  if (!decoys || typeof decoys !== 'object' || Array.isArray(decoys)) return 'Invalid hidden folder decoys'
  const seen = new Set<string>()
  for (const [real, d] of Object.entries(decoys as Record<string, unknown>)) {
    if (!hidden.includes(real)) return `Decoy set for "${real}", which is not a hidden folder`
    if (typeof d !== 'string' || !d.startsWith('/')) return `Decoy for "${real}" must be an absolute path such as /Users/you/Documents/acme-corp`
    const segs = d.split('/').slice(1)
    if (d.endsWith('/') || segs.some((s) => s === '' || s === '.' || s === '..') || !segs.every((s) => HIDDEN_SEG_RE.test(s))) return `Decoy "${d}" must be a clean path with letters, numbers, dots, dashes or underscores`
    if (homeDir && isUnder(homeDir, real) && !isUnder(homeDir, d)) return `Decoy "${d}" must be inside your home folder, like "${real}"`
    if (seen.has(d)) return `Decoy "${d}" is used twice`
    seen.add(d)
    for (const h of hidden) {
      if (isUnder(h, d) || isUnder(d, h)) return `Decoy "${d}" overlaps hidden folder "${h}"`
      const he = encPath(h)
      const de = encPath(d)
      if (de === he || de.startsWith(he + '-') || he.startsWith(de + '-')) return `Decoy "${d}" is too similar to hidden folder "${h}"`
    }
  }
  return null
}

export function isUnder(root: string, path: string): boolean {
  return path === root || path.startsWith(root + '/')
}

// Old configs had one GitLab group in "root". Turns it into "roots" and drops
// the old key. A non-empty "roots" list that is already there wins.
export function migrateLegacyRoot<T extends object>(v: T): T {
  const o = { ...v } as Record<string, unknown>
  if ('root' in o) {
    if (typeof o.root === 'string' && o.root !== '' && !(Array.isArray(o.roots) && o.roots.length > 0)) o.roots = [{ path: o.root, host: 'gitlab' }]
    delete o.root
  }
  return o as T
}

// Returns an error message or null for the company roots
function validateRoots(roots: unknown): string | null {
  if (!Array.isArray(roots)) return 'Invalid company roots'
  if (roots.length > MAX_ROOTS) return `At most ${MAX_ROOTS} company roots`
  for (const r of roots) {
    if (!r || typeof r !== 'object' || typeof r.path !== 'string' || !PATH_RE.test(r.path)) return 'Company root must look like "acme-corp" (letters, numbers, dots, dashes, slashes)'
    if (!HOSTS.includes(r.host)) return `Company root "${r.path}" has an unknown host type`
    if (r.host !== 'gitlab' && r.path.includes('/')) return `Company root "${r.path}" must be a single name, for example acme-org, for a GitHub or other host`
  }
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const a = roots[i].path
      const b = roots[j].path
      if (isUnder(a, b) || isUnder(b, a)) return a === b ? `Company root "${a}" is listed twice` : `Company roots "${a}" and "${b}" overlap`
    }
  }
  return null
}

// Returns an error message or null. knownRemotes: real repo paths decoys must not hit.
export function validateConfig(c: VcloakConfig, knownRemotes: string[] = [], homeDir?: string): string | null {
  if (typeof c.enabled !== 'boolean' || typeof c.maskRoot !== 'boolean' || typeof c.maskLocalFolders !== 'boolean' ||
    typeof c.maskUsername !== 'boolean' || typeof c.failClosed !== 'boolean' || typeof c.coverBridge !== 'boolean' ||
    typeof c.coverTerminals !== 'boolean' || typeof c.coverCodex !== 'boolean' || typeof c.hidePlainNames !== 'boolean') return 'Invalid switch value'
  if (!MODES.includes(c.mode)) return 'Unknown mode'
  if (!['one', 'project', 'all-keep-ext', 'all'].includes(c.hiddenDepth)) return 'Unknown hidden folder depth'
  const rootsError = validateRoots(c.roots)
  if (rootsError) return rootsError
  const hiddenError = validateHidden(c.hiddenFolders, homeDir)
  if (hiddenError) return hiddenError
  const decoyError = validateHiddenDecoys(c.hiddenDecoys ?? {}, c.hiddenFolders, homeDir)
  if (decoyError) return decoyError
  if (c.enabled && c.roots.length === 0 && c.hiddenFolders.length === 0) return 'Enter a company root or a hidden local folder before turning vCloak on'
  if (!Array.isArray(c.exceptions) || !Array.isArray(c.rules)) return 'Invalid lists'
  if (c.exceptions.length > MAX_ITEMS || c.rules.length > MAX_ITEMS) return 'Too many entries'
  const names = c.roots.map((r) => r.path).join(', ')
  // The root a path sits under, or an error text. GitHub and other hosts: owner/repo.
  const rootFor = (p: string, under = 'must be under'): { root: VcloakConfig['roots'][number] } | { error: string } => {
    const root = c.roots.filter((r) => isUnder(r.path, p) && p !== r.path).sort((a, b) => b.path.length - a.path.length)[0]
    if (!root) return { error: `${under} ${names || 'a company root'}` }
    if (root.host !== 'gitlab' && p.split('/').length !== root.path.split('/').length + 1) return { error: `must be owner/repo under ${root.path}` }
    return { root }
  }
  for (const e of c.exceptions) {
    if (typeof e !== 'string' || !PATH_RE.test(e)) return `Exception "${String(e)}" must be a path under ${names}`
    const r = rootFor(e, 'must be a path under')
    if ('error' in r) return `Exception "${e}" ${r.error}`
  }
  const decoys = new Set<string>()
  const reals = c.rules.map((r) => r?.real)
  for (const r of c.rules) {
    if (!r || typeof r.real !== 'string' || typeof r.decoy !== 'string') return 'Invalid rule'
    if (!PATH_RE.test(r.real)) return `Path "${r.real}" must be under ${names}`
    const real = rootFor(r.real)
    if ('error' in real) return `Path "${r.real}" ${real.error}`
    if (!PATH_RE.test(r.decoy)) return `Decoy "${r.decoy}" must be under ${names}`
    const decoy = rootFor(r.decoy)
    if ('error' in decoy) return `Decoy "${r.decoy}" ${decoy.error}`
    if (decoy.root.path !== real.root.path) return `Decoy "${r.decoy}" must be under the same root as "${r.real}" (${real.root.path})`
    if (decoys.has(r.decoy)) return `Decoy "${r.decoy}" is used twice`
    decoys.add(r.decoy)
    const clash = [...reals, ...knownRemotes].find((x) => x && (isUnder(r.decoy, x) || isUnder(x, r.decoy)))
    if (clash) return `Decoy "${r.decoy}" clashes with real path "${clash}"`
  }
  if (new Set(reals).size !== reals.length) return 'The same path is listed twice'
  return null
}

export class VcloakStore {
  constructor(private dir: string, private sealer: Sealer) {}

  private ensureDir(): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    chmodSync(this.dir, 0o700)
  }

  private write(name: string, value: unknown): void {
    this.ensureDir()
    const file = join(this.dir, name)
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, this.sealer.seal(JSON.stringify(value)), { mode: 0o600 })
    renameSync(tmp, file)
    chmodSync(file, 0o600)
  }

  private read(name: string): { value?: unknown; error?: string } {
    const file = join(this.dir, name)
    if (!existsSync(file)) return {}
    try {
      return { value: JSON.parse(this.sealer.open(readFileSync(file))) }
    } catch {
      return { error: `vCloak could not open ${name}. It may have been changed outside vIDE. Save the vCloak settings again to continue.` }
    }
  }

  loadConfig(): { config: VcloakConfig; error?: string } {
    if (!this.sealer.available()) {
      // Settings cannot be read. If vCloak was on, stay on and block sessions
      // rather than letting them through unmasked.
      if (this.wasEnabled()) {
        return {
          config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, failClosed: true },
          error: 'vCloak is on, but the macOS Keychain is not available, so its settings cannot be read. Claude sessions stay blocked until the Keychain works again.',
        }
      }
      return { config: { ...DEFAULT_VCLOAK_CONFIG } }
    }
    const { value, error } = this.read('config.bin')
    if (error) return { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, failClosed: true }, error }
    if (value === undefined) return { config: { ...DEFAULT_VCLOAK_CONFIG } }
    const config = { ...DEFAULT_VCLOAK_CONFIG, ...migrateLegacyRoot(value as Partial<VcloakConfig>) }
    const invalid = validateConfig(config)
    if (invalid) return { config: { ...config, enabled: true, failClosed: true }, error: `vCloak settings are invalid: ${invalid}` }
    return { config }
  }

  saveConfig(config: VcloakConfig): void {
    this.write('config.bin', config)
    // Plain on/off marker, readable without the Keychain (holds no names)
    this.ensureDir()
    const flag = join(this.dir, 'enabled.flag')
    const tmp = `${flag}.${process.pid}.tmp`
    writeFileSync(tmp, config.enabled ? '1' : '0', { mode: 0o600 })
    renameSync(tmp, flag)
    chmodSync(flag, 0o600)
  }

  private wasEnabled(): boolean {
    try {
      return readFileSync(join(this.dir, 'enabled.flag'), 'utf8').trim() === '1'
    } catch {
      // No marker but an encrypted config exists: assume it was on
      return existsSync(join(this.dir, 'config.bin'))
    }
  }

  loadAliases(): { secret: Buffer; entries: AliasEntry[] } {
    const fresh = { secret: randomBytes(32), entries: [] as AliasEntry[] }
    if (!this.sealer.available()) return fresh
    const { value } = this.read('aliases.bin')
    const v = value as { secret?: string; entries?: AliasEntry[] } | undefined
    if (!v || typeof v.secret !== 'string' || !/^[0-9a-f]{64}$/.test(v.secret) || !Array.isArray(v.entries)) return fresh
    const entries = v.entries.filter((e) => Array.isArray(e) && (e[0] === 'c' || e[0] === 'l' || e[0] === 'h' || e[0] === 'w') && typeof e[1] === 'string' && typeof e[2] === 'string')
    return { secret: Buffer.from(v.secret, 'hex'), entries }
  }

  saveAliases(secret: Buffer, entries: AliasEntry[]): void {
    if (!this.sealer.available()) return
    this.write('aliases.bin', { secret: secret.toString('hex'), entries })
  }
}
