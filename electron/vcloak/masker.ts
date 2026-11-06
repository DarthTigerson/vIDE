import { createHash, createHmac } from 'crypto'
import type { VcloakConfig, VcloakHost } from './types'
import { WORDS } from './words'

// Reversible masking of company paths. Every real path under the root gets a
// deterministic alias (HMAC of the real path), so the same name always maps
// to the same alias: the prompt cache keeps working and replies can be
// mapped back. Only aliases are remembered (alias -> real) for unmasking.

const SEG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
// Path-like token: segments joined by "/" or an encoded "%2F"
const TOKEN_RE = /[A-Za-z0-9_.-]+(?:(?:\/|%2[Ff])[A-Za-z0-9_.-]+)*/g
const SEP_SPLIT_RE = /(\/|%2[Ff])/
const USER_ALIAS = 'dev'
const MAX_ATTEMPTS = 50
// Real value prefix of an alias made for a dash-encoded folder name
const DASH = 'dash:'

export class VcloakLeakError extends Error {
  // Local-only diagnostic: where a second masking pass still changed the text.
  // Holds real names, so it is written to the Mac only, never sent anywhere.
  constructor(readonly detail = '', readonly input = '') {
    super('vCloak blocked a request: a protected path could not be masked')
    this.name = 'VcloakLeakError'
  }
}

// First place two strings differ, with some text either side
function diffWindow(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const from = Math.max(0, i - 80)
  return `pass 1: ${JSON.stringify(a.slice(from, i + 80))}\npass 2: ${JSON.stringify(b.slice(from, i + 80))}`
}

export interface LocalRepo {
  // Folder relative to the workspace root, e.g. "platform/billing/payments/invoice-api"
  rel: string
  // Group path from the git remote, e.g. "acme-corp/platform/billing/payments/invoice-api"
  remote: string
}

export interface MaskerWorkspace {
  root: string
  repos: LocalRepo[]
}

export interface MaskerOptions {
  config: VcloakConfig
  workspaces: MaskerWorkspace[]
  homeDir: string
  username: string
  // Does this absolute folder hold a git repository? (hidden folders)
  isProjectRoot?: (absPath: string) => boolean
  // Is this an existing folder? (keeps aliases from matching real folders)
  isDir?: (absPath: string) => boolean
  // Does this absolute path exist (file or folder)? Defaults to isDir
  exists?: (absPath: string) => boolean
  // Names directly inside a folder (lone-name hiding); [] when unknown
  listDir?: (absPath: string) => string[]
  // Resolve a dash-encoded folder name under a hidden folder back to real
  // folder names, e.g. "qStack-qGEO" -> ["qStack", "qGEO"]. null = unknown.
  resolveDashed?: (hiddenFolder: string, rest: string) => string[] | null
  // Is this plain one-word name an ordinary English word? (hidePlainNames)
  // Defaults to yes for every name, so nothing extra is hidden
  isWord?: (name: string) => boolean
}

// A plain one-word name: letters only, long enough to be a project name
const PLAIN_NAME = /^[A-Za-z]{4,}$/

// 'w' = a repo or folder name standing alone in text
export type AliasKind = 'c' | 'l' | 'h' | 'w'
const KINDS: AliasKind[] = ['c', 'l', 'h', 'w']

// A name that cannot be an ordinary word: dash, underscore, digit or mixed
// case, at least 4 characters (sports-api, AcmeApps, qGEO)
export function isDistinctive(name: string): boolean {
  if (name.length < 4 || /^[-.]/.test(name)) return false
  // Mixed case past the first letter: "MegaTool", "Auth.SRV", "Core.Api"
  return /[-_]/.test(name) || /\d/.test(name) || (/[a-z]/.test(name) && /.[A-Z]/.test(name))
}

// Lone-name aliases are distinctive too (two words joined or dashed), so
// restoring them never touches an ordinary word in a reply
function loneShape(real: string, dotted = true): Shape {
  if (/[-_]/.test(real) || shapeOf(real, dotted).joiner === '.') {
    const s = shapeOf(real, dotted)
    return s.parts.length >= 2 ? s : { joiner: s.joiner, parts: [s.parts[0], { style: 'lower', lead: '', digits: 0 }] }
  }
  const digits = Math.min((/(\d*)$/.exec(real) as RegExpExecArray)[1].length, 6)
  // All lowercase with digits (api2) stays lowercase; mixed case becomes CamelCase
  const style: Style = /[A-Z]/.test(real) ? 'cap' : 'lower'
  return { joiner: '', parts: [{ style, lead: '', digits: 0 }, { style, lead: '', digits }] }
}

// Shape of a real folder name, kept by its alias so names do not look hidden
type Style = 'lower' | 'cap' | 'upper' | 'vprefix' | 'digits'
interface PartShape {
  style: Style
  lead: string
  digits: number
}
interface Shape {
  joiner: string
  parts: PartShape[]
}

function partShape(p: string): PartShape {
  const m = /^(.*?)(\d*)$/.exec(p) as RegExpExecArray
  const letters = m[1].replace(/[^A-Za-z]/g, '')
  const digits = Math.min(m[2].length, 6)
  if (letters === '') return { style: digits > 0 ? 'digits' : 'lower', lead: '', digits }
  if (letters.length >= 2 && letters === letters.toUpperCase()) return { style: 'upper', lead: '', digits }
  // No letter of the real name is kept (e.g. the "v" in "qStack"): such names get a capitalised word
  if (letters.length >= 2 && /^[a-z][A-Z]/.test(letters)) return { style: 'cap', lead: '', digits }
  if (/^[A-Z]/.test(letters)) return { style: 'cap', lead: '', digits }
  return { style: 'lower', lead: '', digits }
}

// dotted: "Auth.SRV" or "jsonupdater.cli" keep their dot. Off for names in
// hidden folders, where a dot starts a file type.
export function shapeOf(real: string, dotted = false): Shape {
  if (dotted && !/[-_]/.test(real) && /[A-Za-z0-9]\.[A-Za-z]/.test(real)) {
    return { joiner: '.', parts: real.split('.').filter(Boolean).slice(0, 3).map(partShape) }
  }
  const joiner = real.includes('-') ? '-' : real.includes('_') ? '_' : '-'
  const raw = real.split(/[-_]/).filter(Boolean).slice(0, 3)
  return { joiner, parts: (raw.length ? raw : [real]).map(partShape) }
}

const cap = (w: string) => w[0].toUpperCase() + w.slice(1)

function render(shape: Shape, digest: Buffer): string {
  const used = new Set<number>()
  return shape.parts
    .map((p, i) => {
      // Never the same word twice in one name
      let w = digest.readUInt32BE(i * 4) % WORDS.length
      while (used.has(w)) w = (w + 1) % WORDS.length
      used.add(w)
      const word = WORDS[w]
      let out = ''
      if (p.style === 'lower') out = word
      else if (p.style === 'cap') out = cap(word)
      else if (p.style === 'upper') out = word.toUpperCase()
      else if (p.style === 'vprefix') out = p.lead + cap(word)
      for (let k = 0; k < p.digits; k++) out += String(digest[12 + i * 6 + k] % 10)
      return out
    })
    .join(shape.joiner)
}

// Realistic random name for generated decoys (lowercase words)
export function randomWords(count: number, pick: (n: number) => number): string[] {
  return Array.from({ length: count }, () => WORDS[pick(WORDS.length)])
}

// alias -> real, per kind ('c' group paths, 'l' local relative folders,
// 'h' folders under a hidden local folder, relative to it)
export class AliasTable {
  private rev: Record<AliasKind, Map<string, string>> = { c: new Map(), l: new Map(), h: new Map(), w: new Map() }
  onChange?: () => void
  // Real names that must get a two-word alias even though they look plain
  // (made-up one-word project names), so the alias is never an ordinary word
  forceLone?: (realSeg: string) => boolean
  // Set by the Masker: would this alias path be a real path?
  isReal?: (kind: AliasKind, fullAlias: string, scope?: string, realPath?: string) => boolean

  constructor(private secret: Buffer, entries: [AliasKind, string, string][] = []) {
    for (const [kind, alias, real] of entries) this.rev[kind].set(alias, real)
  }

  get size(): number {
    return this.rev.c.size + this.rev.l.size + this.rev.h.size
  }

  entries(): [AliasKind, string, string][] {
    return KINDS.flatMap((k) => [...this.rev[k]].map(([a, r]) => [k, a, r] as [AliasKind, string, string]))
  }

  entriesOf(kind: AliasKind): [string, string][] {
    return [...this.rev[kind]]
  }

  real(kind: AliasKind, alias: string): string | undefined {
    return this.rev[kind].get(alias)
  }

  // Alias of one segment: realistic words in the shape of the real name,
  // picked from HMAC(secret, kind:scope+realPath:attempt). Retried when the
  // candidate is taken, equals a real name, or is a real path.
  // suffix: kept after the made-up name, e.g. a file extension ".ts"
  segment(kind: AliasKind, realPath: string, parentAlias: string | null, scope = '', suffix = ''): string {
    const realSeg = (realPath.split('/').pop() as string).replace(/^dash:/, '')
    // A distinctive real name gets a distinctive alias in every form, so its
    // alias can also be restored when it stands alone
    // Dotted repo names ("jsonupdater.cli") keep their dot; in hidden folders
    // a dot starts a file type instead
    const dotted = kind !== 'h'
    const shape = kind === 'w' || isDistinctive(realSeg) || this.forceLone?.(realSeg) || (dotted && shapeOf(realSeg, true).joiner === '.') ? loneShape(realSeg, dotted) : shapeOf(realSeg)
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const digest = createHmac('sha256', this.secret).update(`${kind}:${scope ? scope + '\0' : ''}${realPath}:${attempt}`).digest()
      const seg = render(shape, digest) + suffix
      if (seg.toLowerCase() === realSeg.toLowerCase()) continue
      const full = parentAlias === null ? seg : `${parentAlias}/${seg}`
      const known = this.rev[kind].get(full)
      if (known !== undefined) {
        if (known === realPath) return full
        continue
      }
      if (this.isReal?.(kind, full, scope, realPath)) continue
      this.rev[kind].set(full, realPath)
      this.writes++
      this.onChange?.()
      return full
    }
    throw new VcloakLeakError()
  }

  // Realistic name in the shape of realSeg, not stored. Deterministic per key;
  // candidates the reject callback refuses are skipped.
  name(realSeg: string, key: string, reject: (candidate: string) => boolean): string {
    const shape = shapeOf(realSeg)
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const digest = createHmac('sha256', this.secret).update(`n:${key}:${attempt}`).digest()
      const seg = render(shape, digest)
      if (seg.toLowerCase() !== realSeg.toLowerCase() && !reject(seg)) return seg
    }
    throw new VcloakLeakError()
  }

  // Drops an alias and every alias below it
  forget(kind: AliasKind, alias: string): void {
    let changed = false
    for (const key of [...this.rev[kind].keys()]) {
      if (key === alias || key.startsWith(alias + '/')) {
        this.rev[kind].delete(key)
        changed = true
      }
    }
    if (changed) {
      this.generation++
      this.writes++
      this.onChange?.()
    }
  }

  remember(kind: AliasKind, alias: string, real: string): void {
    if (this.rev[kind].get(alias) === real) return
    this.rev[kind].set(alias, real)
    this.writes++
    this.onChange?.()
  }

  clear(): void {
    for (const k of KINDS) this.rev[k].clear()
    this.generation++
    this.writes++
    this.onChange?.()
  }

  // Bumped whenever aliases are removed, so cached masking results expire
  generation = 0
  // Bumped on every change to the table
  writes = 0
}

interface Token {
  segs: string[]
  seps: string[]
}

interface Replacement {
  start: number
  end: number
  segs: string[]
}

function splitToken(t: string): Token {
  const parts = t.split(SEP_SPLIT_RE)
  const segs: string[] = []
  const seps: string[] = []
  parts.forEach((p, i) => (i % 2 === 0 ? segs.push(p) : seps.push(p)))
  return { segs, seps }
}

function rebuild(tok: Token, reps: Replacement[]): string {
  const sorted = [...reps].sort((a, b) => a.start - b.start)
  let out = ''
  let i = 0
  const n = tok.segs.length
  while (i < n) {
    const rep = sorted.find((r) => r.start === i)
    if (rep) {
      const style = tok.seps[i] ?? tok.seps[i - 1] ?? '/'
      out += rep.segs.join(style)
      i = rep.end
    } else {
      out += tok.segs[i]
      i++
    }
    if (i < n) out += tok.seps[i - 1]
  }
  return out
}

// Where a dash-encoded path starts inside a dash-encoded name: the whole
// name, its start, or after a "-" ("-private-tmp-x--Users-..."). It must end
// at the end of the name or at a "-". Returns -1 when absent.
function dashAt(seg: string, enc: string): number {
  for (let at = seg.indexOf(enc); at >= 0; at = seg.indexOf(enc, at + 1)) {
    const end = at + enc.length
    if ((at === 0 || seg[at - 1] === '-') && (end === seg.length || seg[end] === '-')) return at
  }
  return -1
}

function findSeq(segs: string[], seq: string[], from = 0): number {
  if (seq.length === 0) return -1
  outer: for (let k = from; k <= segs.length - seq.length; k++) {
    for (let j = 0; j < seq.length; j++) if (segs[k + j] !== seq[j]) continue outer
    return k
  }
  return -1
}

// "name.git" / "name." at the end of a token: mask the core, keep the suffix
function splitSuffix(seg: string): [string, string] {
  const m = /^(.*?)((?:\.git)?\.*)$/.exec(seg)
  if (!m || !m[1]) return [seg, '']
  return [m[1], m[2]]
}

function isPrefixPath(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

function segsOf(path: string): string[] {
  return path.split('/').filter(Boolean)
}

interface Hidden {
  // Absolute folder, e.g. "/Users/you/Documents"
  path: string
  segs: string[]
  // Segments under the home folder, when it is inside it ("~/" form)
  homeRel: string[] | null
  // Segment lists to look for when unmasking (real, and with the username swapped)
  variants: string[][]
  // Dash-encoded form, e.g. "-Users-you-Documents"
  enc: string
  // Optional decoy shown instead of the folder itself
  decoy: {
    // Segments sent to the AI (username already swapped when asked)
    out: string[]
    // Same, relative to the home folder ("~/" form), null when outside it
    homeOut: string[] | null
    // Segment lists recognised when unmasking or re-masking
    variants: string[][]
    homeRel: string[] | null
    // Dash-encoded form sent to the AI
    enc: string
    // Dash-encoded forms recognised when unmasking or re-masking
    encVariants: string[]
  } | null
}

interface RootInfo {
  // Normalised path, e.g. "acme-corp/platform"
  path: string
  segs: string[]
  host: VcloakHost
}

const encSeg = (s: string) => s.replace(/[^A-Za-z0-9]/g, '-')
const looksLikeFile = (s: string) => /\.[A-Za-z0-9]{1,10}$/.test(s) && !s.endsWith('.')

// Masking results for strings at least this long are cached (by hash), up to
// about CACHE_MAX_CHARS characters of output in total
const CACHE_MIN_CHARS = 256
const CACHE_MAX_CHARS = 32 * 1024 * 1024

export class Masker {
  private config!: VcloakConfig
  private roots: RootInfo[] = []
  private rules = new Map<string, string>()
  private decoys = new Map<string, string>()
  private workspaces: { segs: string[]; homeSegs: string[] | null }[] = []
  private localKnown = new Set<string>()
  // Every real folder and group name in the workspaces' repo paths
  private realSegs = new Set<string>()
  // Full group paths of known repositories (from git remotes)
  private repoPaths = new Set<string>()
  // Distinctive repo and folder names hidden when they stand alone in text
  private loneNames = new Set<string>()
  // Bumped whenever a lone name is learned while masking
  private learned = 0

  // Changes whenever masking learns something: a new alias or a new lone name.
  // A decision made before that point can differ from one made after it.
  private stateMark(): string {
    return `${this.learned}:${this.table.writes}:${this.loneAlias.size}`
  }
  // Real name -> its one alias, shared by path and lone forms
  private loneAlias = new Map<string, string>()
  // Distinctive name -> masked group paths ending in it
  private namePrefixes = new Map<string, Set<string>>()
  // Local folder paths (relative to a workspace) each hidden name appears at
  private localPrefixes = new Map<string, Set<string>>()
  // Other spellings of hidden names ("zorbleton" -> "Zorbleton",
  // "ZORBLETON"), each with the real name and how it is written
  private loneVariants = new Map<string, { real: string; style: 'lower' | 'upper' | 'cap' }>()
  // Names whose alias is being worked out (stops aliasLocal from looping back)
  private inNameAlias = new Set<string>()
  private repoByRel = new Map<string, string>()
  private realGroup = new Set<string>()
  private hidden: Hidden[] = []
  private homeSegs: string[] = []
  private username = ''
  private isProjectRoot: (p: string) => boolean = () => false
  private isDir: (p: string) => boolean = () => false
  private exists: (p: string) => boolean = () => false
  private resolveDashed: (h: string, rest: string) => string[] | null = () => null
  private isWord: (name: string) => boolean = () => true
  stats = { masked: 0 }
  // sha256(input) -> masked output, oldest first
  private cache = new Map<string, string>()
  private cacheSize = 0
  private cacheGen = 0

  constructor(private table: AliasTable, opts: MaskerOptions) {
    // Hidden one-word names get two-word aliases, like distinctive ones
    table.forceLone = (seg) => this.loneNames.has(seg)
    this.update(opts)
  }

  update(opts: MaskerOptions): void {
    this.cache.clear()
    this.cacheSize = 0
    this.config = opts.config
    this.roots = (opts.config.roots ?? [])
      .map((r) => {
        const segs = segsOf(r.path)
        return { path: segs.join('/'), segs, host: r.host }
      })
      .filter((r) => r.segs.length > 0)
      .sort((a, b) => b.segs.length - a.segs.length)
    this.rules = new Map(opts.config.rules.map((r) => [r.real, r.decoy]))
    this.decoys = new Map(opts.config.rules.map((r) => [r.decoy, r.real]))
    this.homeSegs = segsOf(opts.homeDir)
    this.username = opts.username
    this.isProjectRoot = opts.isProjectRoot ?? (() => false)
    this.isDir = opts.isDir ?? (() => false)
    this.exists = opts.exists ?? this.isDir
    this.resolveDashed = opts.resolveDashed ?? (() => null)
    this.isWord = opts.isWord ?? (() => true)
    this.localKnown = new Set()
    this.realSegs = new Set()
    this.repoByRel = new Map()
    this.repoPaths = new Set()
    this.realGroup = new Set()
    this.workspaces = opts.workspaces.map((w) => {
      const segs = segsOf(w.root)
      const underHome = this.homeSegs.length > 0 && findSeq(segs, this.homeSegs) === 0
      return { segs, homeSegs: underHome ? segs.slice(this.homeSegs.length) : null }
    })
    for (const w of opts.workspaces) {
      for (const repo of w.repos) {
        const rel = segsOf(repo.rel)
        if (rel.length === 0) continue
        this.repoByRel.set(rel.join('/'), repo.remote)
        this.repoPaths.add(segsOf(repo.remote).join('/'))
        for (let i = 1; i <= rel.length; i++) this.localKnown.add(rel.slice(0, i).join('/'))
        for (const x of rel) this.realSegs.add(x)
        for (const x of segsOf(repo.remote)) this.realSegs.add(x)
        this.addRealGroup(repo.remote)
      }
    }
    for (const r of opts.config.rules) {
      this.addRealGroup(r.real)
      this.addRealGroup(r.decoy)
    }
    for (const e of opts.config.exceptions) this.addRealGroup(e)
    for (const root of this.roots) this.addRealGroup(root.path)
    this.hidden = (opts.config.hiddenFolders ?? [])
      .map((path) => {
        const segs = segsOf(path)
        const underHome = this.homeSegs.length > 0 && segs.length > this.homeSegs.length && findSeq(segs, this.homeSegs) === 0
        const variants = [segs]
        const u = segs.findIndex((x, i) => i > 0 && (segs[i - 1] === 'Users' || segs[i - 1] === 'home') && x === this.username)
        if (this.config.maskUsername && this.username && u > 0) variants.push(segs.map((x, i) => (i === u ? USER_ALIAS : x)))
        return { path: '/' + segs.join('/'), segs, homeRel: underHome ? segs.slice(this.homeSegs.length) : null, variants, enc: encSeg('/' + segs.join('/')), decoy: this.buildDecoy(opts.config.hiddenDecoys?.[path] ?? this.autoDecoy(segs)) }
      })
      .filter((h) => h.segs.length > 0)
      .sort((a, b) => b.segs.length - a.segs.length)
    this.table.isReal = (kind, full, scope, realPath) => this.isRealAlias(kind, full, scope, realPath)
    this.dropCollidingHidden()
    this.buildLoneNames(opts)
  }

  private swapUser(segs: string[]): string[] {
    if (!this.config.maskUsername || !this.username) return segs
    return segs.map((x, i) => (i > 0 && (segs[i - 1] === 'Users' || segs[i - 1] === 'home') && x === this.username ? USER_ALIAS : x))
  }

  // Made-up sibling for a hidden folder without a typed decoy, so the folder
  // name itself is hidden too: /Users/you/Documents/proj -> .../Documents/Harbor
  private autoDecoy(segs: string[]): string | undefined {
    if (segs.length < 2) return undefined
    const parent = segs.slice(0, -1)
    const name = this.table.name(segs[segs.length - 1], 'folder:/' + segs.join('/'), (c) => this.isDir('/' + [...parent, c].join('/')))
    return '/' + [...parent, name].join('/')
  }

  private buildDecoy(path: string | undefined): Hidden['decoy'] {
    const segs = path ? segsOf(path) : []
    if (segs.length === 0) return null
    const out = this.swapUser(segs)
    const underHome = this.homeSegs.length > 0 && segs.length > this.homeSegs.length && findSeq(segs, this.homeSegs) === 0
    const homeRel = underHome ? segs.slice(this.homeSegs.length) : null
    const variants = out.join('/') === segs.join('/') ? [segs] : [out, segs]
    return { out, homeOut: homeRel, variants, homeRel, enc: encSeg('/' + out.join('/')), encVariants: [...new Set(variants.map((v) => encSeg('/' + v.join('/'))))] }
  }

  private addRealGroup(path: string): void {
    const s = segsOf(path)
    for (let i = 1; i <= s.length; i++) this.realGroup.add(s.slice(0, i).join('/'))
  }

  // Would this alias path be taken for a real path? Such aliases are rejected.
  // For hidden folders the made-up name must not exist next to the real
  // name either: the model sees the alias folder as if it were the real one,
  // so a real sibling with the same name would be restored to the wrong file.
  private isRealAlias(kind: AliasKind, full: string, scope?: string, realPath?: string): boolean {
    // An alias name that is also a real folder or group name would be masked
    // again when seen alone or in a local path ("core" for one repo while a
    // real "core" folder exists), so it is never used
    if (kind === 'c' || kind === 'l') {
      const last = full.split('/').pop() as string
      if (this.realSegs.has(last)) return true
    }
    if (kind === 'c') return this.realGroup.has(full)
    if (kind === 'l') return this.localKnown.has(full)
    if (kind === 'w') return this.loneNames.has(full) || this.realGroup.has(full)
    if (!scope) return false
    if (this.exists(`${scope}/${full}`)) return true
    if (!realPath || realPath.startsWith(DASH)) return false
    const cand = full.split('/').pop() as string
    const realParent = realPath.split('/').slice(0, -1)
    return this.exists(`${scope}/${[...realParent, cand].join('/')}`)
  }

  private buildLoneNames(opts: MaskerOptions): void {
    const names = new Set<string>()
    const add = (n: string) => { if (this.hideable(n) && n !== this.username) names.add(n) }
    // Repository and group names with a dot ("jsonupdater.cli") are names, not
    // files: distinctive enough to hide alone
    const addRepo = (n: string) => { if (/^[A-Za-z0-9][\w-]*\.[A-Za-z][\w.-]*$/.test(n) && n.length >= 6) names.add(n); else add(n) }
    const rootNames = new Set(this.roots.flatMap((r) => r.segs))
    this.loneAlias = new Map()
    this.namePrefixes = new Map()
    this.localPrefixes = new Map()
    for (const w of opts.workspaces) {
      for (const repo of w.repos) {
        const segs = segsOf(repo.remote)
        for (let d = 1; d <= segs.length; d++) {
          const prefix = segs.slice(0, d).join('/')
          if (!rootNames.has(segs[d - 1]) && this.shouldMask(prefix)) {
            addRepo(segs[d - 1])
            let set = this.namePrefixes.get(segs[d - 1])
            if (!set) this.namePrefixes.set(segs[d - 1], (set = new Set()))
            set.add(prefix)
          }
        }
        if (!this.config.maskLocalFolders) continue
        const rel = segsOf(repo.rel)
        for (let d = 1; d <= rel.length; d++) {
          if (this.shouldMask(this.canonicalOfLocal(rel.slice(0, d)))) {
            addRepo(rel[d - 1])
            let set = this.localPrefixes.get(rel[d - 1])
            if (!set) this.localPrefixes.set(rel[d - 1], (set = new Set()))
            set.add(rel.slice(0, d).join('/'))
          }
        }
      }
    }
    // Root names stay as the root rules leave them. Hidden-folder names below
    // are added after this: a hidden name that is also listed as a root is
    // still hidden (the root rule then steps aside for it, see maskToken)
    for (const r of rootNames) names.delete(r)
    // Hidden-folder names already seen in paths (works when listing is blocked)
    for (const [alias, real] of this.table.entriesOf('h')) {
      if (!alias.includes('/') && !real.includes('/') && !real.startsWith(DASH)) add(real)
    }
    // Workspace folders that hold company repos, e.g. ".../AcmeApps"
    for (const w of opts.workspaces) {
      if (w.repos.length > 0) add(segsOf(w.root).pop() ?? '')
    }
    const list = opts.listDir ?? (() => [])
    for (const h of this.hidden) {
      add(h.segs[h.segs.length - 1])
      for (const child of list(h.path)) add(child)
    }
    this.loneNames = names
    this.loneVariants = new Map()
    for (const n of names) this.addVariants(n)
  }

  // Lowercase, UPPERCASE and Capitalised spellings of a hidden name, unless
  // that spelling is itself a hidden name, too short, or an ordinary word
  private addVariants(n: string): void {
    const lower = n.toLowerCase()
    const cands: [string, 'lower' | 'upper' | 'cap'][] = [[lower, 'lower'], [n.toUpperCase(), 'upper'], [cap(lower), 'cap']]
    for (const [v, style] of cands) {
      if (v === n || v.length < 4 || this.loneNames.has(v) || this.loneVariants.has(v)) continue
      if (PLAIN_NAME.test(v) && this.isWord(v)) continue
      this.loneVariants.set(v, { real: n, style })
    }
  }

  // Alias of a hidden name in any of its spellings, or null when seg is not one.
  // A spelling gets the name's alias written the same way, so restoring stays
  // exact; when that is ambiguous it gets an alias of its own.
  private loneAliasFor(seg: string): string | null {
    if (this.loneNames.has(seg)) return this.nameAlias(seg)
    const v = this.loneVariants.get(seg)
    if (!v) return null
    const known = this.loneAlias.get(seg)
    if (known) return known
    const base = this.nameAlias(v.real)
    const styled = v.style === 'lower' ? base.toLowerCase() : v.style === 'upper' ? base.toUpperCase() : cap(base.toLowerCase())
    const taken = this.table.real('w', styled)
    let alias: string
    if (styled !== base && (taken === undefined || taken === seg) && !this.loneNames.has(styled) && !this.loneVariants.has(styled)) {
      this.table.remember('w', styled, seg)
      alias = styled
    } else {
      alias = this.table.segment('w', seg, null)
    }
    this.loneAlias.set(seg, alias)
    return alias
  }

  // Hidden names inside one segment: whole, before a file type
  // ("zorbleton.yaml"), or as parts of an underscore_joined name
  private maskLoneSeg(seg: string, last: boolean): string | null {
    const one = (p: string, allowSuffix: boolean): string | null => {
      const whole = this.loneAliasFor(p)
      if (whole !== null) return whole
      if (allowSuffix) {
        const [core, suffix] = splitSuffix(p)
        if (core !== p) { const a = this.loneAliasFor(core); if (a !== null) return a + suffix }
      }
      const m = /^(.+?)(\.[A-Za-z0-9]{1,10})$/.exec(p)
      if (m) { const a = this.loneAliasFor(m[1]); if (a !== null) return a + m[2] }
      return null
    }
    const whole = one(seg, last)
    if (whole !== null) return whole
    if (!seg.includes('_')) return null
    const parts = seg.split('_')
    let changed = false
    const out = parts.map((p, i) => {
      const a = p ? one(p, last && i === parts.length - 1) : null
      if (a === null) return p
      changed = true
      return a
    })
    return changed ? out.join('_') : null
  }

  // Lone aliases by lowercase, rebuilt when the table changes
  private lowerAliases: Map<string, string> | null = null
  private lowerAliasesAt = -1

  // The model may write an alias in another case than it was shown
  // ("Bravocanyon" for "bravocanyon"): the real name comes back written the
  // same way (Capitalised or UPPERCASE)
  private realOfAnyCase(p: string): string | undefined {
    const exact = this.table.real('w', p)
    if (exact !== undefined) return exact
    if (p.length < 4 || !/[A-Za-z]/.test(p)) return undefined
    if (!this.lowerAliases || this.lowerAliasesAt !== this.table.writes) {
      const map = new Map<string, string>()
      const ambiguous = new Set<string>()
      for (const [alias, real] of this.table.entriesOf('w')) {
        const k = alias.toLowerCase()
        const had = map.get(k)
        if (had !== undefined && had.toLowerCase() !== real.toLowerCase()) ambiguous.add(k)
        // Prefer the entry whose real name is the base spelling
        if (had === undefined || this.loneNames.has(real)) map.set(k, real)
      }
      for (const k of ambiguous) map.delete(k)
      this.lowerAliases = map
      this.lowerAliasesAt = this.table.writes
    }
    const base = this.lowerAliases.get(p.toLowerCase())
    if (base === undefined) return undefined
    if (p === p.toUpperCase()) return base.toUpperCase()
    if (p === p.toLowerCase()) return base.toLowerCase()
    if (p === cap(p.toLowerCase())) return cap(base.toLowerCase())
    return undefined
  }

  private unmaskLoneSeg(seg: string): string | null {
    const one = (p: string): string => {
      const r = this.realOfAnyCase(p)
      if (r !== undefined) return r
      const m = /^(.+?)(\.[A-Za-z0-9]{1,10})$/.exec(p)
      if (m) { const r2 = this.realOfAnyCase(m[1]); if (r2 !== undefined) return r2 + m[2] }
      return p
    }
    const out = seg.includes('_') ? seg.split('_').map(one).join('_') : one(seg)
    return out === seg ? null : out
  }

  // Hidden names inside a dash-encoded folder name (Claude's project folders,
  // "-Users-you-Documents-<name>"), wherever they sit between dashes
  private maskLoneDash(seg: string): string {
    // Hidden-folder dash names have their own rule, and their aliases may
    // contain words that are also hidden names
    for (const h of this.hidden) {
      const heads = [h.enc, ...(h.decoy ? h.decoy.encVariants : [])]
      if (heads.some((e) => dashAt(seg, e) >= 0 || seg.includes(e + '-'))) return seg
    }
    let out = seg
    const names = [...this.loneNames].sort((a, b) => b.length - a.length)
    for (const name of names) {
      const enc = encSeg(name)
      if (!out.includes(enc)) continue
      let from = 0
      for (let at = out.indexOf(enc, from); at >= 0; at = out.indexOf(enc, from)) {
        const end = at + enc.length
        if (at > 0 && out[at - 1] === '-' && (end === out.length || out[end] === '-')) {
          const a = encSeg(this.nameAlias(name))
          out = out.slice(0, at) + a + out.slice(end)
          from = at + a.length
        } else {
          from = at + 1
        }
      }
    }
    return out
  }

  private unmaskLoneDash(seg: string): string {
    let out = seg
    const entries = this.table.entriesOf('w').sort((a, b) => b[0].length - a[0].length)
    for (const [alias, real] of entries) {
      const enc = encSeg(alias)
      if (!out.includes(enc)) continue
      let from = 0
      for (let at = out.indexOf(enc, from); at >= 0; at = out.indexOf(enc, from)) {
        const end = at + enc.length
        if (at > 0 && out[at - 1] === '-' && (end === out.length || out[end] === '-')) {
          const r = encSeg(real)
          out = out.slice(0, at) + r + out.slice(end)
          from = at + r.length
        } else {
          from = at + 1
        }
      }
    }
    return out
  }

  // Names hidden when they stand alone: distinctive ones (dash, digit, mixed
  // case) and, with hidePlainNames, plain one-word names that are not
  // ordinary English words ("zorbleton", not "forum")
  private hideable(name: string): boolean {
    if (isDistinctive(name)) return true
    return this.config.hidePlainNames === true && PLAIN_NAME.test(name) && !this.isWord(name)
  }

  // A distinctive hidden-folder name seen in a path joins the lone names.
  // Cached results may hold it unmasked, so the cache is emptied.
  private learnLone(name: string): void {
    if (!this.hideable(name) || name === this.username || this.loneNames.has(name)) return
    this.loneNames.add(name)
    this.addVariants(name)
    this.learned++
    this.cache.clear()
    this.cacheSize = 0
  }

  // The one alias of a real name: the alias its path form uses where that is
  // unambiguous, otherwise its own lone alias. Registered for restoring.
  private nameAlias(name: string): string {
    const known = this.loneAlias.get(name)
    if (known) return known
    let alias: string | null = null
    const rootLower = new Set(this.roots.flatMap((r) => r.segs.map((x) => x.toLowerCase())))
    for (const h of this.hidden) {
      if (h.segs[h.segs.length - 1] === name) {
        const d = h.decoy?.out[h.decoy.out.length - 1]
        if (d && isDistinctive(d) && !rootLower.has(d.toLowerCase())) alias = d
        break
      }
      if (this.exists(`${h.path}/${name}`) || this.table.entriesOf('h').some(([a, r]) => r === name && !a.includes('/'))) {
        alias = this.table.segment('h', name, null, h.path)
        break
      }
    }
    if (!alias) {
      const prefixes = this.namePrefixes.get(name)
      if (prefixes && prefixes.size === 1) {
        const a = this.aliasGroupPath(segsOf([...prefixes][0]))
        if (a) alias = a[a.length - 1]
      }
    }
    // A workspace folder: the alias its local path uses, so the name looks
    // the same alone and in paths ("genesis-repos" and ".../genesis-repos/x")
    if (!alias && !this.inNameAlias.has(name)) {
      const locals = this.localPrefixes.get(name)
      if (locals && locals.size === 1) {
        this.inNameAlias.add(name)
        try {
          const a = this.aliasLocal(segsOf([...locals][0]))
          if (a) alias = a[a.length - 1]
        } finally {
          this.inNameAlias.delete(name)
        }
        const set = this.loneAlias.get(name)
        if (set) return set
      }
    }
    const taken = alias ? this.table.real('w', alias) : undefined
    if (!alias || alias === name || (taken !== undefined && taken !== name)) alias = this.table.segment('w', name, null)
    else this.table.remember('w', alias, name)
    this.loneAlias.set(name, alias)
    return alias
  }

  // Removes stored hidden-folder aliases that now clash with a real name next
  // to the real path (left over from older versions or settings)
  private dropCollidingHidden(): void {
    if (this.hidden.length === 0) return
    for (const [alias, real] of this.table.entriesOf('h')) {
      if (real.startsWith(DASH)) continue
      const aliasLast = alias.split('/').pop() as string
      const realSegs = real.split('/')
      if (aliasLast === realSegs[realSegs.length - 1]) continue
      for (const h of this.hidden) {
        if (!this.exists(`${h.path}/${real}`)) continue
        if (this.exists(`${h.path}/${[...realSegs.slice(0, -1), aliasLast].join('/')}`)) {
          this.table.forget('h', alias)
          break
        }
      }
    }
  }

  get active(): boolean {
    return this.config.enabled && (this.roots.length > 0 || this.hidden.length > 0)
  }

  // Would this real group path be hidden under the current mode?
  // The configured root a real group path sits under (longest match)
  private rootOf(path: string): RootInfo | null {
    for (const r of this.roots) if (isPrefixPath(r.path, path)) return r
    return null
  }

  shouldMask(path: string): boolean {
    const root = this.rootOf(path)
    if (!root || path === root.path) return false
    switch (this.config.mode) {
      case 'all':
        return true
      case 'all-except':
        return !this.config.exceptions.some((e) => isPrefixPath(e, path))
      case 'selective':
        return [...this.rules.keys()].some((r) => isPrefixPath(r, path))
    }
  }

  // Alias segments for a real group path, or null to leave it as is
  aliasGroupPath(realSegs: string[]): string[] | null {
    const real = realSegs.join('/')
    const root = this.rootOf(real)
    if (!root) return null
    const rootLen = root.segs.length
    const rootReal = root.path
    if (realSegs.length === rootLen) {
      return this.config.maskRoot ? [this.table.segment('c', rootReal, null)] : null
    }
    if (!this.shouldMask(real) && !this.config.maskRoot) return null
    let cur = this.config.maskRoot ? this.table.segment('c', rootReal, null) : rootReal
    let curReal = rootReal
    for (let d = rootLen; d < realSegs.length; d++) {
      curReal += '/' + realSegs[d]
      const decoy = this.rules.get(curReal)
      if (decoy && this.config.mode === 'selective') {
        cur = this.config.maskRoot ? [cur, ...segsOf(decoy).slice(rootLen)].join('/') : decoy
        this.table.remember('c', cur, curReal)
      } else if (this.shouldMask(curReal)) {
        cur = this.table.segment('c', curReal, cur)
      } else {
        cur += '/' + realSegs[d]
        if (this.config.maskRoot) this.table.remember('c', cur, curReal)
      }
    }
    const out = segsOf(cur)
    return out.join('/') === real ? null : out
  }

  // Group path for a local relative folder (via the repo's git remote)
  private canonicalOfLocal(rel: string[]): string {
    for (let i = rel.length; i > 0; i--) {
      const remote = this.repoByRel.get(rel.slice(0, i).join('/'))
      if (remote) return [remote, ...rel.slice(i)].join('/')
    }
    // A folder above several repos: use the root of a repo below it
    const prefix = rel.join('/') + '/'
    for (const [r, remote] of this.repoByRel) {
      if (r.startsWith(prefix)) {
        const root = this.rootOf(remote)
        if (root) return [...root.segs, ...rel].join('/')
      }
    }
    return [...(this.roots[0]?.segs ?? []), ...rel].join('/')
  }

  private aliasLocal(rel: string[]): string[] | null {
    // A folder layout that mirrors the GitLab path reuses the repo's aliases,
    // so a name looks the same in local paths, repo paths and alone
    const canonical = segsOf(this.canonicalOfLocal(rel))
    if (canonical.length > rel.length && canonical.slice(-rel.length).join('/') === rel.join('/')) {
      const g = this.aliasGroupPath(canonical)
      if (g && g.length === canonical.length) {
        const out = g.slice(-rel.length)
        if (out.join('/') === rel.join('/')) return null
        for (let d = 1; d <= rel.length; d++) this.table.remember('l', out.slice(0, d).join('/'), rel.slice(0, d).join('/'))
        return out
      }
    }
    let cur: string | null = null
    let changed = false
    for (let d = 0; d < rel.length; d++) {
      const realPrefix = rel.slice(0, d + 1).join('/')
      if (this.shouldMask(this.canonicalOfLocal(rel.slice(0, d + 1)))) {
        // A distinctive name keeps its one alias (the one it has alone and in
        // repo paths) when the folder layout differs from the repo path
        const lone = this.loneNames.has(rel[d]) ? this.nameAlias(rel[d]) : null
        const cand: string | null = lone ? (cur === null ? lone : `${cur}/${lone}`) : null
        const owner = cand ? this.table.real('l', cand) : undefined
        if (cand && (owner === undefined || owner === realPrefix)) {
          this.table.remember('l', cand, realPrefix)
          cur = cand
        } else {
          cur = this.table.segment('l', realPrefix, cur)
        }
        changed = true
      } else {
        cur = cur === null ? rel[d] : `${cur}/${rel[d]}`
        if (changed) this.table.remember('l', cur, realPrefix)
      }
    }
    return changed && cur ? segsOf(cur) : null
  }

  // Longest known local folder starting at segs[from]
  private localMatch(segs: string[], from: number): number {
    let best = 0
    for (let j = from + 1; j <= segs.length; j++) {
      if (this.localKnown.has(segs.slice(from, j).join('/'))) best = j - from
    }
    return best
  }

  private isAliasGroupPath(spanSegs: string[], rootLen: number): boolean {
    for (let j = spanSegs.length; j > rootLen; j--) {
      const p = spanSegs.slice(0, j).join('/')
      if (this.table.real('c', p) !== undefined || this.decoys.has(p)) return true
    }
    return false
  }

  // Hidden folders: alias the folder names under H, walking down. Stops after
  // the first project folder (one with a .git entry); names inside a project
  // stay real. Without a project, every name is hidden except a final file
  // name. Returns the alias segments for the first `used` segments of rel.
  private aliasHidden(h: Hidden, rel: string[], allowFile: boolean): { out: string[]; used: number } | null {
    const depth = this.config.hiddenDepth ?? 'one'
    let out: string[] = []
    let realRel: string[] = []
    let used = rel.length
    for (let d = 0; d < rel.length; d++) {
      const seg = rel[d]
      if (seg === '.' || seg === '..' || seg === '-') { used = d; break }
      const abs = `${h.path}/${[...realRel, seg].join('/')}`
      const known = this.table.real('h', [...out, seg].join('/'))
      if (known !== undefined && !known.startsWith(DASH) && !this.exists(abs)) {
        // already an alias (second pass over our own output)
        out = [...out, seg]
        realRel = known.split('/')
      } else {
        const isFile = d === rel.length - 1 && looksLikeFile(seg) && !this.isDir(abs)
        if (allowFile && isFile && (depth === 'project' || depth === 'one')) { used = d; break }
        realRel = [...realRel, seg]
        if (d === 0) this.learnLone(seg)
        const ext = isFile && depth === 'all-keep-ext' ? (/\.[A-Za-z0-9]{1,10}$/.exec(seg) as RegExpExecArray)[0] : ''
        out = this.table.segment('h', realRel.join('/'), out.length ? out.join('/') : null, h.path, ext).split('/')
      }
      if (depth === 'one') { used = d + 1; break }
      if (depth === 'project' && this.isProjectRoot(`${h.path}/${realRel.join('/')}`)) { used = d + 1; break }
    }
    if (used === 0) return null
    const alias = out.slice(0, used)
    return alias.every((a, i) => a === rel[i]) ? null : { out: alias, used }
  }

  // Where a folder (given as absolute variants and a "~/" form) sits in a token
  private folderMatch(segs: string[], prev: string, prev2: string, variants: string[][], homeRel: string[] | null): { from: number; to: number; home: boolean } | null {
    for (const v of variants) {
      const a = findSeq(segs, v)
      if (a >= 0 && (a > 0 || prev === '/')) return { from: a, to: a + v.length, home: false }
    }
    if (homeRel && prev === '/' && prev2 === '~' && findSeq(segs, homeRel) === 0) return { from: 0, to: homeRel.length, home: true }
    return null
  }

  private hiddenStart(h: Hidden, segs: string[], prev: string, prev2: string, variants: string[][]): number {
    const m = this.folderMatch(segs, prev, prev2, variants, h.homeRel)
    return m ? m.to : -1
  }

  // Start of a hidden folder decoy in a token (our own output), or -1
  private decoyStart(segs: string[], prev: string, prev2: string): number {
    let best = -1
    for (const h of this.hidden) {
      if (!h.decoy) continue
      const m = this.folderMatch(segs, prev, prev2, h.decoy.variants, h.decoy.homeRel)
      if (m && (best < 0 || m.from < best)) best = m.from
    }
    return best
  }

  private maskHiddenPath(segs: string[], prev: string, prev2: string): Replacement | null {
    const n = segs.length
    for (const h of this.hidden) {
      const m = this.folderMatch(segs, prev, prev2, [h.segs], h.homeRel)
      if (!m) continue
      const start = m.to
      const head = h.decoy ? (m.home ? h.decoy.homeOut : h.decoy.out) : null
      if (start >= n) {
        if (!head) continue
        // The folder itself, possibly with a trailing "." or ".git"
        return { start: m.from, end: m.to, segs: [...head] }
      }
      const rel = segs.slice(start)
      const [core, suffix] = splitSuffix(rel[rel.length - 1])
      rel[rel.length - 1] = core
      const r = this.aliasHidden(h, rel, true)
      if (!r && !head) continue
      if (r && r.used === rel.length) r.out[r.used - 1] += suffix
      if (!head) return { start, end: start + r!.used, segs: r!.out }
      return { start: m.from, end: start + (r ? r.used : 0), segs: [...head, ...(r ? r.out : [])] }
    }
    return null
  }

  // Original rest of a dash-encoded name for an alias we made, else null
  private restoreDashed(rest: string): string | null {
    let best: { key: string; real: string } | null = null
    for (const [alias, real] of this.table.entriesOf('h')) {
      if (real.startsWith(DASH)) {
        if (alias === rest) return real.slice(DASH.length)
        continue
      }
      const key = alias.split('/').join('-')
      if ((rest === key || rest.startsWith(key + '-')) && (!best || key.length > best.key.length)) best = { key, real }
    }
    if (!best) return null
    return [...best.real.split('/').map(encSeg), ...(rest.length > best.key.length ? [rest.slice(best.key.length + 1)] : [])].join('-')
  }

  private maskDashed(h: Hidden, seg: string): string | null {
    const outEnc = h.decoy ? h.decoy.enc : h.enc
    if (seg === h.enc) return h.decoy ? outEnc : null
    const m = /^(.*?)(\.*)$/.exec(seg.slice(h.enc.length + 1)) as RegExpExecArray
    const rest = m[1]
    if (!rest) return h.decoy ? `${outEnc}${seg.slice(h.enc.length)}` : null
    const resolved = this.resolveDashed(h.path, rest)
    if (resolved && resolved.length > 0) {
      const r = this.aliasHidden(h, resolved, false)
      if (!r) return h.decoy ? `${outEnc}-${rest}${m[2]}` : null
      const tail = resolved.slice(r.used).map(encSeg)
      return `${outEnc}-${[...r.out, ...tail].join('-')}${m[2]}`
    }
    if (this.restoreDashed(rest) !== null) return h.decoy ? `${outEnc}-${rest}${m[2]}` : null
    const alias = this.table.segment('h', DASH + rest, null, h.path)
    return `${outEnc}-${alias}${m[2]}`
  }

  // prefix: the dash-encoded folder form found at the start of seg
  private unmaskDashed(h: Hidden, seg: string, prefix = h.enc): string | null {
    const isDecoy = prefix !== h.enc
    if (seg === prefix) return isDecoy ? h.enc : null
    const m = /^(.*?)(\.*)$/.exec(seg.slice(prefix.length + 1)) as RegExpExecArray
    const restored = m[1] ? this.restoreDashed(m[1]) : null
    if (restored === null) return isDecoy ? `${h.enc}${seg.slice(prefix.length)}` : null
    return `${h.enc}-${restored}${m[2]}`
  }

  // Decoy path of a hidden folder back to the real folder
  private unmaskDecoyPath(segs: string[], prev: string, prev2: string): Replacement | null {
    const n = segs.length
    for (const h of this.hidden) {
      if (!h.decoy) continue
      const m = this.folderMatch(segs, prev, prev2, h.decoy.variants, h.decoy.homeRel)
      if (!m) continue
      const head = m.home ? (h.homeRel ?? h.segs) : h.segs
      for (let j = n; j > m.to; j--) {
        const span = segs.slice(m.to, j)
        let suffix = ''
        if (j === n) {
          const [core, suf] = splitSuffix(span[span.length - 1])
          span[span.length - 1] = core
          suffix = suf
        }
        const real = this.table.real('h', span.join('/'))
        if (real !== undefined && !real.startsWith(DASH)) {
          const realSegs = real.split('/')
          realSegs[realSegs.length - 1] += suffix
          return { start: m.from, end: j, segs: [...head, ...realSegs] }
        }
      }
      return { start: m.from, end: m.to, segs: [...head] }
    }
    return null
  }

  private unmaskHiddenPath(segs: string[], prev: string, prev2: string): Replacement | null {
    const n = segs.length
    for (const h of this.hidden) {
      const start = this.hiddenStart(h, segs, prev, prev2, h.variants)
      if (start < 0 || start >= n) continue
      for (let j = n; j > start; j--) {
        const span = segs.slice(start, j)
        let suffix = ''
        if (j === n) {
          const [core, suf] = splitSuffix(span[span.length - 1])
          span[span.length - 1] = core
          suffix = suf
        }
        const real = this.table.real('h', span.join('/'))
        if (real !== undefined && !real.startsWith(DASH)) {
          const realSegs = real.split('/')
          realSegs[realSegs.length - 1] += suffix
          return { start, end: j, segs: realSegs }
        }
      }
    }
    return null
  }

  // Where a root starts in a token, or -1. A GitLab group can sit anywhere in
  // a path. A GitHub (or other) owner only counts in owner position: first in
  // the token, after a host ("github.com/<owner>", "git@host:<owner>") or after
  // an API route ("orgs/<owner>", "repos/<owner>"). "<someone>/vide/pull/1" names a repo called vide, not an owner.
  private rootAt(segs: string[], r: RootInfo): number {
    if (r.host === 'gitlab') return findSeq(segs, r.segs)
    for (let from = 0; ; ) {
      const at = findSeq(segs, r.segs, from)
      if (at < 0) return -1
      const before = at > 0 ? segs[at - 1] : ''
      if (at === 0 || before.includes('.') || before.includes(':') || before === 'orgs' || before === 'users' || before === 'enterprises' || before === 'repos') return at
      from = at + 1
    }
  }

  private maskToken(text: string, index: number, raw: string): string {
    const tok = splitToken(raw)
    const { segs } = tok
    const n = segs.length
    const reps: Replacement[] = []
    const prev = index > 0 ? text[index - 1] : ''
    const prev2 = index > 1 ? text[index - 2] : ''
    // A hidden folder decoy (our own output) and what follows it stay as is
    const guardFrom = this.hidden.length > 0 ? this.decoyStart(segs, prev, prev2) : -1
    const overlaps = (a: number, b: number) => reps.some((r) => a < r.end && b > r.start) || (guardFrom >= 0 && b > guardFrom)

    // Hidden local folders (absolute or ~/ form)
    const hiddenRep = this.hidden.length > 0 ? this.maskHiddenPath(segs, prev, prev2) : null
    if (hiddenRep && !overlaps(hiddenRep.start, hiddenRep.end)) reps.push(hiddenRep)

    // Company group paths (plain, URL, ssh, %2F-encoded, registry)
    let k = -1
    let root: RootInfo | null = null
    for (const r of this.roots) {
      // A root whose name is also a hidden-folder name: the name rule wins, so
      // the name has one alias everywhere (and with root hiding off, the root
      // rule would keep it real on one pass and the name rule mask it on the next)
      if (r.segs.some((x) => this.loneNames.has(x))) continue
      const at = this.rootAt(segs, r)
      if (at >= 0 && (root === null || r.segs.length > root.segs.length)) { k = at; root = r }
    }
    if (root) {
      const rootLen = root.segs.length
      let end = k + rootLen
      // GitLab: any depth, up to a "-" route. GitHub and others: owner/repo only
      // GitHub routes such as /orgs/<org>/people name the org, not a repo
      const orgRoute = root.host !== 'gitlab' && k > 0 && (segs[k - 1] === 'orgs' || segs[k - 1] === 'users' || segs[k - 1] === 'enterprises')
      const limit = root.host === 'gitlab' ? n : orgRoute ? end : Math.min(n, end + 1)
      while (end < limit && segs[end] !== '-' && SEG_RE.test(segs[end])) end++
      // A known repository ends the span: file paths after it stay real
      if (root.host === 'gitlab') {
        for (let e = end; e > k + rootLen; e--) {
          const cand = segs.slice(k, e)
          const last = splitSuffix(cand[cand.length - 1])[0]
          if (this.repoPaths.has([...cand.slice(0, -1), last].join('/'))) { end = e; break }
        }
      }
      const span = segs.slice(k, end)
      let suffix = ''
      if (end === n && span.length > rootLen) {
        const [core, suf] = splitSuffix(span[span.length - 1])
        span[span.length - 1] = core
        suffix = suf
      }
      if (!this.isAliasGroupPath(span, rootLen) && !overlaps(k, end)) {
        const alias = this.aliasGroupPath(span)
        if (alias) {
          alias[alias.length - 1] += suffix
          reps.push({ start: k, end, segs: alias })
        }
      }
    }

    // Dash-encoded hidden folders, e.g. "-Users-you-Documents-proj"
    if (this.hidden.length > 0) {
      for (let s = 0; s < n; s++) {
        for (const h of this.hidden) {
          const exact = segs[s] === h.enc && h.decoy !== null
          if ((!exact && (!segs[s].startsWith(h.enc + '-') || segs[s].length <= h.enc.length + 1)) || overlaps(s, s + 1)) continue
          if (h.decoy && h.decoy.encVariants.some((e) => segs[s] === e || segs[s].startsWith(e + '-'))) continue
          const out = this.maskDashed(h, segs[s])
          if (out !== null) reps.push({ start: s, end: s + 1, segs: [out] })
        }
      }
    }

    // Workspace folders: absolute, ~/ relative, or bare relative
    // Does this token start inside a workspace (absolute or ~/ form)?
    let wsEnd = -1
    for (const w of this.workspaces) {
      const a = findSeq(segs, w.segs)
      if (a >= 0 && (a > 0 || prev === '/')) { wsEnd = a + w.segs.length; break }
      if (w.homeSegs && w.homeSegs.length > 0 && prev === '/' && prev2 === '~' && findSeq(segs, w.homeSegs) === 0) { wsEnd = w.homeSegs.length; break }
    }
    // Runs beside the rules above: a match elsewhere in the token (a GitHub
    // root, say) must not leave a local folder name real on this pass and
    // masked on the next
    const repsBeforeLocal = reps.length
    if (this.config.maskLocalFolders && this.localKnown.size > 0 && guardFrom < 0) {
      let relStart = wsEnd
      // The workspace folder's own name, e.g. ".../AcmeApps"
      if (wsEnd > 0 && this.loneNames.has(segs[wsEnd - 1]) && !overlaps(wsEnd - 1, wsEnd)) reps.push({ start: wsEnd - 1, end: wsEnd, segs: [this.nameAlias(segs[wsEnd - 1])] })
      let bare = false
      if (relStart < 0 && prev !== '/' && prev !== '~' && reps.length === repsBeforeLocal) {
        relStart = segs[0] === '.' ? 1 : 0
        bare = true
      }
      if (relStart >= 0 && relStart < n) {
        const len = this.localMatch(segs, relStart)
        const longEnough = !bare || len >= 2 || relStart + len < n
        if (len > 0 && longEnough && !overlaps(relStart, relStart + len)) {
          const alias = this.aliasLocal(segs.slice(relStart, relStart + len))
          if (alias) reps.push({ start: relStart, end: relStart + len, segs: alias })
        }
      }
    }

    // /Users/<name>
    if (this.config.maskUsername && this.username) {
      for (let u = 0; u < n - 1; u++) {
        if ((segs[u] === 'Users' || segs[u] === 'home') && segs[u + 1] === this.username && (u > 0 || prev === '/')) {
          if (!reps.some((r) => u + 1 >= r.start && u + 1 < r.end)) reps.push({ start: u + 1, end: u + 2, segs: [USER_ALIAS] })
        }
      }
    }

    // Distinctive repo and folder names anywhere the rules above left them:
    // alone in text, or after a prefix vCloak does not know ("$WS/<name>").
    // Workspace paths are left alone when local folder hiding is off.
    if (this.loneNames.size > 0 && !(wsEnd >= 0 && !this.config.maskLocalFolders)) {
      for (let s = 0; s < n; s++) {
        if (segs[s].startsWith('-') || overlaps(s, s + 1) || reps.some((r) => s >= r.start && s < r.end)) continue
        // A name such as "Auth.SRV" is a name, not "Auth" plus an extension:
        // the whole segment is tried first
        const out = this.maskLoneSeg(segs[s], s === n - 1)
        if (out !== null) reps.push({ start: s, end: s + 1, segs: [out] })
      }
    }

    // The username on its own (e.g. the owner column of "ls -l"). One-way:
    // "dev" in a reply is not turned back, it is too common a word.
    if (this.config.maskUsername && this.username.length >= 4) {
      for (let s = 0; s < n; s++) {
        if (segs[s] === this.username && !reps.some((r) => s >= r.start && s < r.end) && !(s > 0 && (segs[s - 1] === 'Users' || segs[s - 1] === 'home'))) {
          reps.push({ start: s, end: s + 1, segs: [USER_ALIAS] })
        }
      }
    }

    // Workspace folder name inside Claude's dash-encoded folders,
    // e.g. "-Users-you-work-AcmeApps" (memory and scratchpad folders)
    // Other hidden names inside dash-encoded folders, e.g. "-Users-you-x-<name>"
    for (let s = 0; s < n; s++) {
      if (!segs[s].startsWith('-') || reps.some((r) => s >= r.start && s < r.end)) continue
      const ws = this.maskWsDash(segs[s])
      let out = this.loneNames.size > 0 ? this.maskLoneDash(ws ?? segs[s]) : ws
      if (out !== null && ws === null && out !== segs[s] && this.config.maskUsername && this.username) out = this.swapUserDash(out, encSeg(this.username), USER_ALIAS)
      if (out !== null && out !== segs[s]) reps.push({ start: s, end: s + 1, segs: [out] })
    }

    // Claude's dash-encoded folders, e.g. "-Users-<name>-Documents"
    if (this.config.maskUsername && this.username) {
      const enc = encSeg(this.username)
      for (let s = 0; s < n; s++) {
        if (reps.some((r) => s >= r.start && s < r.end)) continue
        if (!segs[s].startsWith('-')) continue
        const out = this.swapUserDash(segs[s], enc, USER_ALIAS)
        if (out !== segs[s]) reps.push({ start: s, end: s + 1, segs: [out] })
      }
    }

    if (reps.length === 0) return raw
    this.stats.masked += reps.length
    return rebuild(tok, reps)
  }

  // "-Users-<from>" -> "-Users-<to>" wherever it starts a path inside a
  // dash-encoded name: at the start, or after a "-" as in
  // "-private-tmp-x--Users-<from>-..." (a folder under /private/tmp)
  private swapUserDash(seg: string, from: string, to: string): string {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return seg.replace(new RegExp(`(^|-)(-(?:Users|home)-)${esc}(?=-|$)`, 'g'), `$1$2${to}`)
  }

  private maskWsDash(seg: string): string | null {
    for (const w of this.workspaces) {
      const name = w.segs[w.segs.length - 1]
      if (!name || !this.loneNames.has(name)) continue
      const enc = encSeg('/' + w.segs.join('/'))
      const at = dashAt(seg, enc)
      if (at < 0) continue
      let out = seg.slice(0, at) + encSeg('/' + w.segs.slice(0, -1).join('/')) + '-' + encSeg(this.nameAlias(name)) + seg.slice(at + enc.length)
      if (this.config.maskUsername && this.username) out = this.swapUserDash(out, encSeg(this.username), USER_ALIAS)
      return out
    }
    return null
  }

  private unmaskWsDash(seg: string): string | null {
    for (const w of this.workspaces) {
      const name = w.segs[w.segs.length - 1]
      const alias = name ? this.loneAlias.get(name) : undefined
      if (!alias) continue
      const enc = encSeg('/' + [...w.segs.slice(0, -1), alias].join('/'))
      const variants = [enc]
      if (this.config.maskUsername && this.username) variants.push(this.swapUserDash(enc, encSeg(this.username), USER_ALIAS))
      for (const v of variants) {
        const at = dashAt(seg, v)
        if (at >= 0) return seg.slice(0, at) + encSeg('/' + w.segs.join('/')) + seg.slice(at + v.length)
      }
    }
    return null
  }

  // Hidden-folder names seen anywhere in a request are learned before any of
  // it is masked, so a plain "ls" result earlier in the request is covered
  private prelearn(s: string): void {
    for (const h of this.hidden) {
      const heads = [h.path + '/', ...(h.homeRel ? ['~/' + h.homeRel.join('/') + '/'] : [])]
      for (const head of heads) {
        let at = s.indexOf(head)
        while (at >= 0) {
          const m = /^[A-Za-z0-9_.-]+/.exec(s.slice(at + head.length, at + head.length + 256))
          if (m) this.learnLone(m[0])
          at = s.indexOf(head, at + head.length)
        }
      }
      let at = s.indexOf(h.enc + '-')
      while (at >= 0) {
        const m = /^[A-Za-z0-9_.-]+/.exec(s.slice(at + h.enc.length + 1, at + h.enc.length + 257))
        const resolved = m ? this.resolveDashed(h.path, m[0].replace(/\.+$/, '')) : null
        if (resolved && resolved[0]) this.learnLone(resolved[0])
        at = s.indexOf(h.enc + '-', at + 1)
      }
    }
  }

  private unmaskToken(text: string, index: number, raw: string): string {
    const tok = splitToken(raw)
    const { segs } = tok
    const n = segs.length
    const prev = index > 0 ? text[index - 1] : ''
    const prev2 = index > 1 ? text[index - 2] : ''
    const reps: Replacement[] = []

    // Hidden folder aliases take priority; the generic lookup skips them
    const fixed: Replacement[] = []
    if (this.hidden.length > 0) {
      const hp = this.unmaskDecoyPath(segs, prev, prev2) ?? this.unmaskHiddenPath(segs, prev, prev2)
      if (hp) fixed.push(hp)
      for (let s = 0; s < n; s++) {
        for (const h of this.hidden) {
          if (fixed.some((f) => s >= f.start && s < f.end)) continue
          const prefixes = h.decoy ? h.decoy.encVariants : [h.enc]
          const prefix = prefixes.find((e) => segs[s] === e || segs[s].startsWith(e + '-'))
          if (!prefix) continue
          const out = this.unmaskDashed(h, segs[s], h.decoy ? prefix : h.enc)
          if (out !== null) fixed.push({ start: s, end: s + 1, segs: [out] })
        }
      }
    }
    // A single-segment alias is a plain word: only restore it in path context
    const pathContext = n > 1 || prev === '/' || prev === '~'

    let i = 0
    while (i < n) {
      const here = fixed.find((f) => f.start === i)
      if (here) {
        reps.push(here)
        i = here.end
        continue
      }
      const limit = Math.min(n, ...fixed.filter((f) => f.start > i).map((f) => f.start))
      let hit: Replacement | null = null
      for (let j = limit; j > i && !hit; j--) {
        const span = segs.slice(i, j)
        let suffix = ''
        if (j === n) {
          const [core, suf] = splitSuffix(span[span.length - 1])
          span[span.length - 1] = core
          suffix = suf
        }
        const key = span.join('/')
        // Hidden-folder aliases are unique, so they are restored in any path,
        // also after a real parent (e.g. "$HOME_DIR/<alias>/file" in a shell)
        const hiddenReal = i > 0 || prev === '/' ? this.table.real('h', key) : undefined
        const loneReal = j - i === 1 ? this.table.real('w', key) : undefined
        const real = this.decoys.get(key) ?? this.table.real('c', key) ?? this.table.real('l', key) ?? (hiddenReal && !hiddenReal.startsWith(DASH) ? hiddenReal : undefined) ?? loneReal
        // A lone word is only restored in path context, except a company root
        // or a lone-name alias: those are distinctive and come back everywhere
        if (j - i === 1 && !pathContext && loneReal === undefined && !(real !== undefined && this.roots.some((r) => r.path === real))) continue
        if (real !== undefined && real !== key) {
          const realSegs = segsOf(real)
          realSegs[realSegs.length - 1] += suffix
          hit = { start: i, end: j, segs: realSegs }
        }
      }
      if (hit) {
        reps.push(hit)
        i = hit.end
      } else {
        const dashed = segs[i].startsWith('-')
        const wsDash = dashed ? this.unmaskWsDash(segs[i]) : null
        const loneDash = dashed ? this.unmaskLoneDash(wsDash ?? segs[i]) : null
        const loneSeg = dashed ? null : this.unmaskLoneSeg(segs[i])
        if (loneDash !== null && loneDash !== segs[i]) {
          const out = wsDash === null && this.config.maskUsername && this.username ? this.swapUserDash(loneDash, USER_ALIAS, encSeg(this.username)) : loneDash
          reps.push({ start: i, end: i + 1, segs: [out] })
        } else if (loneSeg !== null) {
          reps.push({ start: i, end: i + 1, segs: [loneSeg] })
        } else if (this.config.maskUsername && this.username && segs[i] === USER_ALIAS && i > 0 && (segs[i - 1] === 'Users' || segs[i - 1] === 'home')) {
          reps.push({ start: i, end: i + 1, segs: [this.username] })
        } else if (this.config.maskUsername && this.username) {
          const out = segs[i].startsWith('-') ? this.swapUserDash(segs[i], USER_ALIAS, encSeg(this.username)) : segs[i]
          if (out !== segs[i]) reps.push({ start: i, end: i + 1, segs: [out] })
        }
        i++
      }
    }
    return reps.length ? rebuild(tok, reps) : raw
  }

  private maskOnce(s: string): string {
    return s.replace(TOKEN_RE, (raw, index: number) => this.maskToken(s, index, raw))
  }

  // Mask one string; throws VcloakLeakError when the result is not stable
  maskText(s: string): string {
    if (!this.active || s.length === 0) return s
    // Claude resends the whole conversation every turn: earlier messages are
    // masked once and then served from this cache. Results are deterministic,
    // so a cached result equals a fresh one until settings or aliases change.
    const cacheable = s.length >= CACHE_MIN_CHARS
    let key = ''
    if (cacheable) {
      if (this.cacheGen !== this.table.generation) {
        this.cache.clear()
        this.cacheSize = 0
        this.cacheGen = this.table.generation
      }
      key = createHash('sha256').update(s).digest('base64')
      const hit = this.cache.get(key)
      if (hit !== undefined) {
        // Refresh its place so busy entries are evicted last
        this.cache.delete(key)
        this.cache.set(key, hit)
        return hit
      }
    }
    // Something learned part way through the first pass (a new alias, or a
    // hidden-folder name seen in a path after it was already written alone)
    // can make the second pass differ. Masking again from the start, with
    // everything now known, then gives a stable result.
    let out = ''
    for (let round = 0; ; round++) {
      const mark = this.stateMark()
      out = this.maskOnce(s)
      const before = this.stats.masked
      const again = this.maskOnce(out)
      this.stats.masked = before
      if (again === out) break
      if (this.stateMark() === mark || round >= 3) throw new VcloakLeakError(diffWindow(out, again), s)
    }
    if (cacheable) {
      this.cache.set(key, out)
      this.cacheSize += out.length
      for (const [k, v] of this.cache) {
        if (this.cacheSize <= CACHE_MAX_CHARS) break
        this.cache.delete(k)
        this.cacheSize -= v.length
      }
    }
    return out
  }

  unmaskText(s: string): string {
    if (s.length === 0 || (this.table.size + this.decoys.size === 0 && !this.config.maskUsername && !this.hidden.some((h) => h.decoy))) return s
    return s.replace(TOKEN_RE, (raw, index: number) => this.unmaskToken(s, index, raw))
  }

  maskBody<T>(body: T): T {
    if (!this.active) return body
    if (this.hidden.length > 0) walk(body, (s) => { this.prelearn(s); return s })
    // A name learned in a later string would leave earlier strings holding it
    // unmasked: mask the whole body again when that happens
    for (let round = 0; ; round++) {
      const mark = this.stateMark()
      const out = walk(body, (s) => this.maskText(s)) as T
      if (this.stateMark() === mark || round >= 3) return out
    }
  }

  unmaskBody<T>(body: T): T {
    return walk(body, (s) => this.unmaskText(s)) as T
  }
}

// Fields that are identifiers, signatures or binary, never prose
const SKIP_KEYS = new Set([
  'type', 'id', 'tool_use_id', 'name', 'model', 'signature', 'data', 'media_type', 'cache_control', 'metadata', 'role', 'stop_reason', 'stop_sequence',
  // OpenAI Responses / Chat Completions and Gemini opaque fields
  'encrypted_content', 'call_id', 'item_id', 'previous_response_id', 'tool_call_id', 'thoughtSignature', 'thought_signature', 'finish_reason', 'finishReason',
])

// Deep string rewrite. Thinking blocks are signed by Anthropic: changing
// them breaks the signature, so they pass through untouched both ways.
export function walk(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map((v) => walk(v, fn))
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Gemini thought parts carry a signature over their text too
    if (obj.type === 'thinking' || obj.type === 'redacted_thinking' || obj.thought === true) return obj
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(obj)) out[key] = SKIP_KEYS.has(key) ? v : walk(v, fn)
    return out
  }
  return value
}
