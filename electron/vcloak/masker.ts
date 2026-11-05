import { createHmac } from 'crypto'
import type { VcloakConfig } from './types'
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
  constructor() {
    super('vCloak blocked a request: a protected path could not be masked')
    this.name = 'VcloakLeakError'
  }
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
  // Resolve a dash-encoded folder name under a hidden folder back to real
  // folder names, e.g. "vSuite-vCAD" -> ["vSuite", "vCAD"]. null = unknown.
  resolveDashed?: (hiddenFolder: string, rest: string) => string[] | null
}

export type AliasKind = 'c' | 'l' | 'h'
const KINDS: AliasKind[] = ['c', 'l', 'h']

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
  if (letters.length >= 2 && /^[a-z][A-Z]/.test(letters)) return { style: 'vprefix', lead: letters[0], digits }
  if (/^[A-Z]/.test(letters)) return { style: 'cap', lead: '', digits }
  return { style: 'lower', lead: '', digits }
}

export function shapeOf(real: string): Shape {
  const joiner = real.includes('-') ? '-' : real.includes('_') ? '_' : '-'
  const raw = real.split(/[-_]/).filter(Boolean).slice(0, 3)
  return { joiner, parts: (raw.length ? raw : [real]).map(partShape) }
}

const cap = (w: string) => w[0].toUpperCase() + w.slice(1)

function render(shape: Shape, digest: Buffer): string {
  return shape.parts
    .map((p, i) => {
      const word = WORDS[digest.readUInt32BE(i * 4) % WORDS.length]
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
  private rev: Record<AliasKind, Map<string, string>> = { c: new Map(), l: new Map(), h: new Map() }
  onChange?: () => void
  // Set by the Masker: would this alias path be a real path?
  isReal?: (kind: AliasKind, fullAlias: string, scope?: string) => boolean

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
  segment(kind: AliasKind, realPath: string, parentAlias: string | null, scope = ''): string {
    const realSeg = (realPath.split('/').pop() as string).replace(/^dash:/, '')
    const shape = shapeOf(realSeg)
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const digest = createHmac('sha256', this.secret).update(`${kind}:${scope ? scope + '\0' : ''}${realPath}:${attempt}`).digest()
      const seg = render(shape, digest)
      if (seg.toLowerCase() === realSeg.toLowerCase()) continue
      const full = parentAlias === null ? seg : `${parentAlias}/${seg}`
      const known = this.rev[kind].get(full)
      if (known !== undefined) {
        if (known === realPath) return full
        continue
      }
      if (this.isReal?.(kind, full, scope)) continue
      this.rev[kind].set(full, realPath)
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

  remember(kind: AliasKind, alias: string, real: string): void {
    if (this.rev[kind].get(alias) === real) return
    this.rev[kind].set(alias, real)
    this.onChange?.()
  }

  clear(): void {
    for (const k of KINDS) this.rev[k].clear()
    this.onChange?.()
  }
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

const encSeg = (s: string) => s.replace(/[^A-Za-z0-9]/g, '-')
const looksLikeFile = (s: string) => /\.[A-Za-z0-9]{1,10}$/.test(s) && !s.endsWith('.')

export class Masker {
  private config!: VcloakConfig
  private rootSegs: string[] = []
  private rules = new Map<string, string>()
  private decoys = new Map<string, string>()
  private workspaces: { segs: string[]; homeSegs: string[] | null }[] = []
  private localKnown = new Set<string>()
  private repoByRel = new Map<string, string>()
  private realGroup = new Set<string>()
  private hidden: Hidden[] = []
  private homeSegs: string[] = []
  private username = ''
  private isProjectRoot: (p: string) => boolean = () => false
  private isDir: (p: string) => boolean = () => false
  private resolveDashed: (h: string, rest: string) => string[] | null = () => null
  stats = { masked: 0 }

  constructor(private table: AliasTable, opts: MaskerOptions) {
    this.update(opts)
  }

  update(opts: MaskerOptions): void {
    this.config = opts.config
    this.rootSegs = segsOf(opts.config.root)
    this.rules = new Map(opts.config.rules.map((r) => [r.real, r.decoy]))
    this.decoys = new Map(opts.config.rules.map((r) => [r.decoy, r.real]))
    this.homeSegs = segsOf(opts.homeDir)
    this.username = opts.username
    this.isProjectRoot = opts.isProjectRoot ?? (() => false)
    this.isDir = opts.isDir ?? (() => false)
    this.resolveDashed = opts.resolveDashed ?? (() => null)
    this.localKnown = new Set()
    this.repoByRel = new Map()
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
        for (let i = 1; i <= rel.length; i++) this.localKnown.add(rel.slice(0, i).join('/'))
        this.addRealGroup(repo.remote)
      }
    }
    for (const r of opts.config.rules) {
      this.addRealGroup(r.real)
      this.addRealGroup(r.decoy)
    }
    for (const e of opts.config.exceptions) this.addRealGroup(e)
    for (let r = 0; r < this.rootSegs.length; r++) this.realGroup.add(this.rootSegs.slice(0, r + 1).join('/'))
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
    this.table.isReal = (kind, full, scope) => this.isRealAlias(kind, full, scope)
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
  private isRealAlias(kind: AliasKind, full: string, scope?: string): boolean {
    if (kind === 'c') return this.realGroup.has(full)
    if (kind === 'l') return this.localKnown.has(full)
    return scope ? this.isDir(`${scope}/${full}`) : false
  }

  get active(): boolean {
    return this.config.enabled && (this.rootSegs.length > 0 || this.hidden.length > 0)
  }

  // Would this real group path be hidden under the current mode?
  shouldMask(path: string): boolean {
    const root = this.rootSegs.join('/')
    if (root === '' || !isPrefixPath(root, path) || path === root) return false
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
    const rootLen = this.rootSegs.length
    const real = realSegs.join('/')
    const rootReal = realSegs.slice(0, rootLen).join('/')
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
    return [...this.rootSegs, ...rel].join('/')
  }

  private aliasLocal(rel: string[]): string[] | null {
    let cur: string | null = null
    let changed = false
    for (let d = 0; d < rel.length; d++) {
      const realPrefix = rel.slice(0, d + 1).join('/')
      if (this.shouldMask(this.canonicalOfLocal(rel.slice(0, d + 1)))) {
        cur = this.table.segment('l', realPrefix, cur)
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

  private isAliasGroupPath(spanSegs: string[]): boolean {
    const rootLen = this.rootSegs.length
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
    let out: string[] = []
    let realRel: string[] = []
    let used = rel.length
    for (let d = 0; d < rel.length; d++) {
      const seg = rel[d]
      if (seg === '.' || seg === '..' || seg === '-') { used = d; break }
      const abs = `${h.path}/${[...realRel, seg].join('/')}`
      const known = this.table.real('h', [...out, seg].join('/'))
      if (known !== undefined && !known.startsWith(DASH) && !this.isDir(abs)) {
        // already an alias (second pass over our own output)
        out = [...out, seg]
        realRel = known.split('/')
      } else {
        if (allowFile && d === rel.length - 1 && looksLikeFile(seg) && !this.isDir(abs)) { used = d; break }
        realRel = [...realRel, seg]
        out = this.table.segment('h', realRel.join('/'), out.length ? out.join('/') : null, h.path).split('/')
      }
      if (this.isProjectRoot(`${h.path}/${realRel.join('/')}`)) { used = d + 1; break }
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
    const k = findSeq(segs, this.rootSegs)
    if (k >= 0) {
      let end = k + this.rootSegs.length
      while (end < n && segs[end] !== '-' && SEG_RE.test(segs[end])) end++
      const span = segs.slice(k, end)
      let suffix = ''
      if (end === n && span.length > this.rootSegs.length) {
        const [core, suf] = splitSuffix(span[span.length - 1])
        span[span.length - 1] = core
        suffix = suf
      }
      if (!this.isAliasGroupPath(span) && !overlaps(k, end)) {
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
    if (this.config.maskLocalFolders && this.localKnown.size > 0 && reps.length === 0 && guardFrom < 0) {
      let relStart = -1
      for (const w of this.workspaces) {
        const a = findSeq(segs, w.segs)
        if (a >= 0 && (a > 0 || prev === '/')) { relStart = a + w.segs.length; break }
        if (w.homeSegs && w.homeSegs.length > 0 && prev === '/' && prev2 === '~' && findSeq(segs, w.homeSegs) === 0) {
          relStart = w.homeSegs.length
          break
        }
      }
      let bare = false
      if (relStart < 0 && prev !== '/' && prev !== '~') {
        relStart = segs[0] === '.' ? 1 : 0
        bare = true
      }
      if (relStart >= 0 && relStart < n) {
        const len = this.localMatch(segs, relStart)
        const longEnough = !bare || len >= 2 || relStart + len < n
        if (len > 0 && longEnough) {
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

    // Claude's dash-encoded folders, e.g. "-Users-<name>-Documents"
    if (this.config.maskUsername && this.username) {
      const enc = encSeg(this.username)
      for (let s = 0; s < n; s++) {
        if (reps.some((r) => s >= r.start && s < r.end)) continue
        const m = /^-(Users|home)-/.exec(segs[s])
        if (!m) continue
        const rest = segs[s].slice(m[0].length)
        if (rest === enc || rest.startsWith(enc + '-')) reps.push({ start: s, end: s + 1, segs: [`-${m[1]}-${USER_ALIAS}${rest.slice(enc.length)}`] })
      }
    }

    if (reps.length === 0) return raw
    this.stats.masked += reps.length
    return rebuild(tok, reps)
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
        if (j - i === 1 && !pathContext) continue
        const span = segs.slice(i, j)
        let suffix = ''
        if (j === n) {
          const [core, suf] = splitSuffix(span[span.length - 1])
          span[span.length - 1] = core
          suffix = suf
        }
        const key = span.join('/')
        const real = this.decoys.get(key) ?? this.table.real('c', key) ?? this.table.real('l', key)
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
        if (this.config.maskUsername && this.username && segs[i] === USER_ALIAS && i > 0 && (segs[i - 1] === 'Users' || segs[i - 1] === 'home')) {
          reps.push({ start: i, end: i + 1, segs: [this.username] })
        } else if (this.config.maskUsername && this.username) {
          const m = new RegExp(`^-(Users|home)-${USER_ALIAS}(?=-|$)`).exec(segs[i])
          if (m) reps.push({ start: i, end: i + 1, segs: [`-${m[1]}-${encSeg(this.username)}${segs[i].slice(m[0].length)}`] })
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
    const out = this.maskOnce(s)
    const before = this.stats.masked
    const again = this.maskOnce(out)
    this.stats.masked = before
    if (again !== out) throw new VcloakLeakError()
    return out
  }

  unmaskText(s: string): string {
    if (s.length === 0 || (this.table.size + this.decoys.size === 0 && !this.config.maskUsername && !this.hidden.some((h) => h.decoy))) return s
    return s.replace(TOKEN_RE, (raw, index: number) => this.unmaskToken(s, index, raw))
  }

  maskBody<T>(body: T): T {
    if (!this.active) return body
    return walk(body, (s) => this.maskText(s)) as T
  }

  unmaskBody<T>(body: T): T {
    return walk(body, (s) => this.unmaskText(s)) as T
  }
}

// Fields that are identifiers, signatures or binary, never prose
const SKIP_KEYS = new Set(['type', 'id', 'tool_use_id', 'name', 'model', 'signature', 'data', 'media_type', 'cache_control', 'metadata', 'role', 'stop_reason', 'stop_sequence'])

// Deep string rewrite. Thinking blocks are signed by Anthropic: changing
// them breaks the signature, so they pass through untouched both ways.
export function walk(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map((v) => walk(v, fn))
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.type === 'thinking' || obj.type === 'redacted_thinking') return obj
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(obj)) out[key] = SKIP_KEYS.has(key) ? v : walk(v, fn)
    return out
  }
  return value
}
