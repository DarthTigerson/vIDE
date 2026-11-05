import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig, type VcloakMode } from './types'

// Encrypted on-disk state under userData/vcloak (dir 0700, files 0600).
// Sealing uses Electron safeStorage (macOS Keychain). A file that exists but
// cannot be opened is treated as tampered: vCloak reports an error and new
// Claude sessions are refused until the settings are saved again.

export interface Sealer {
  available(): boolean
  seal(plain: string): Buffer
  open(sealed: Buffer): string
}

type AliasEntry = ['c' | 'l' | 'h', string, string]

const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/
const MODES: VcloakMode[] = ['all', 'all-except', 'selective']
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

// Returns an error message or null. knownRemotes: real repo paths decoys must not hit.
export function validateConfig(c: VcloakConfig, knownRemotes: string[] = [], homeDir?: string): string | null {
  if (typeof c.enabled !== 'boolean' || typeof c.maskRoot !== 'boolean' || typeof c.maskLocalFolders !== 'boolean' ||
    typeof c.maskUsername !== 'boolean' || typeof c.failClosed !== 'boolean') return 'Invalid switch value'
  if (!MODES.includes(c.mode)) return 'Unknown mode'
  if (typeof c.root !== 'string' || (c.root !== '' && !PATH_RE.test(c.root))) return 'Company root must look like "acme-corp" (letters, numbers, dots, dashes, slashes)'
  const hiddenError = validateHidden(c.hiddenFolders, homeDir)
  if (hiddenError) return hiddenError
  const decoyError = validateHiddenDecoys(c.hiddenDecoys ?? {}, c.hiddenFolders, homeDir)
  if (decoyError) return decoyError
  if (c.enabled && c.root === '' && c.hiddenFolders.length === 0) return 'Enter a company root or a hidden local folder before turning vCloak on'
  if (!Array.isArray(c.exceptions) || !Array.isArray(c.rules)) return 'Invalid lists'
  if (c.exceptions.length > MAX_ITEMS || c.rules.length > MAX_ITEMS) return 'Too many entries'
  for (const e of c.exceptions) {
    if (typeof e !== 'string' || !PATH_RE.test(e) || !isUnder(c.root, e) || e === c.root) return `Exception "${e}" must be a path under ${c.root}`
  }
  const decoys = new Set<string>()
  const reals = c.rules.map((r) => r?.real)
  for (const r of c.rules) {
    if (!r || typeof r.real !== 'string' || typeof r.decoy !== 'string') return 'Invalid rule'
    if (!PATH_RE.test(r.real) || !isUnder(c.root, r.real) || r.real === c.root) return `Path "${r.real}" must be under ${c.root}`
    if (!PATH_RE.test(r.decoy) || !isUnder(c.root, r.decoy) || r.decoy === c.root) return `Decoy "${r.decoy}" must be under ${c.root}`
    if (decoys.has(r.decoy)) return `Decoy "${r.decoy}" is used twice`
    decoys.add(r.decoy)
    const clash = [...reals, ...knownRemotes].find((real) => real && (isUnder(r.decoy, real) || isUnder(real, r.decoy)))
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
    if (!this.sealer.available()) return { config: { ...DEFAULT_VCLOAK_CONFIG } }
    const { value, error } = this.read('config.bin')
    if (error) return { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, failClosed: true }, error }
    if (value === undefined) return { config: { ...DEFAULT_VCLOAK_CONFIG } }
    const config = { ...DEFAULT_VCLOAK_CONFIG, ...(value as Partial<VcloakConfig>) }
    const invalid = validateConfig(config)
    if (invalid) return { config: { ...config, enabled: true, failClosed: true }, error: `vCloak settings are invalid: ${invalid}` }
    return { config }
  }

  saveConfig(config: VcloakConfig): void {
    this.write('config.bin', config)
  }

  loadAliases(): { secret: Buffer; entries: AliasEntry[] } {
    const fresh = { secret: randomBytes(32), entries: [] as AliasEntry[] }
    if (!this.sealer.available()) return fresh
    const { value } = this.read('aliases.bin')
    const v = value as { secret?: string; entries?: AliasEntry[] } | undefined
    if (!v || typeof v.secret !== 'string' || !/^[0-9a-f]{64}$/.test(v.secret) || !Array.isArray(v.entries)) return fresh
    const entries = v.entries.filter((e) => Array.isArray(e) && (e[0] === 'c' || e[0] === 'l' || e[0] === 'h') && typeof e[1] === 'string' && typeof e[2] === 'string')
    return { secret: Buffer.from(v.secret, 'hex'), entries }
  }

  saveAliases(secret: Buffer, entries: AliasEntry[]): void {
    if (!this.sealer.available()) return
    this.write('aliases.bin', { secret: secret.toString('hex'), entries })
  }
}
