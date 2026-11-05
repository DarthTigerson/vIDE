import { describe, it, expect } from 'vitest'
import { AliasTable, Masker, type MaskerOptions } from '../masker'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig } from '../types'

const SECRET = Buffer.alloc(32, 7)
const HOME = '/Users/kf'
const H = '/Users/kf/Documents'

const PROJECTS = new Set([`${H}/clients/acme/app`, `${H}/vSuite/vCAD`, `${H}/Notes/vault`])
const DIRS = new Set([H, `${H}/clients`, `${H}/clients/acme`, `${H}/Notes`, ...PROJECTS, `${H}/real`])
const DASHED: Record<string, string[]> = { 'vSuite-vCAD': ['vSuite', 'vCAD'], 'clients-acme-app-src': ['clients', 'acme', 'app', 'src'] }

function make(cfg: Partial<VcloakConfig> = {}, extra: Partial<MaskerOptions> = {}) {
  const table = new AliasTable(SECRET)
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: '', hiddenFolders: [H], ...cfg },
    workspaces: [],
    homeDir: HOME,
    username: 'kf',
    isProjectRoot: (p) => PROJECTS.has(p),
    isDir: (p) => DIRS.has(p),
    resolveDashed: (h, rest) => (h === H ? DASHED[rest] ?? null : null),
    ...extra,
  })
  return { table, masker }
}

// Auto decoy for H: a made-up sibling of "Documents", e.g. /Users/kf/Harbor
const D = '/Users/kf/[A-Z][a-z]+'
const roundTrip = (m: Masker, s: string) => m.unmaskText(m.maskText(s))
const idempotent = (m: Masker, s: string) => {
  const once = m.maskText(s)
  expect(m.maskText(once)).toBe(once)
  return once
}

describe('vCloak hidden folders', () => {
  it('is active with an empty root once a folder is hidden', () => {
    expect(make().masker.active).toBe(true)
    expect(make({ hiddenFolders: [] }).masker.active).toBe(false)
    expect(make({ enabled: false }).masker.active).toBe(false)
  })

  it('masks folders down to the project and keeps names inside it', () => {
    const { masker } = make()
    const s = `edit ${H}/clients/acme/app/src/main.ts now`
    const out = idempotent(masker, s)
    expect(out).toMatch(new RegExp(`^edit ${D}/[a-z]+/[a-z]+/[a-z]+/src/main\\.ts now$`))
    expect(out).not.toMatch(/Documents|clients|acme|app\//)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('works in ~/ form', () => {
    const { masker } = make()
    const s = 'see ~/Documents/vSuite/vCAD/README.md'
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/vSuite|vCAD/)
    expect(out).toMatch(/^see ~\/[A-Z][a-z]+\/v[A-Z][a-z]+\/v[A-Z][a-z]+\/README\.md$/)
    expect(out).not.toContain('Documents')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('shares aliases between the absolute and ~/ forms', () => {
    const { masker } = make()
    const a = masker.maskText(`${H}/vSuite/vCAD/x.md`).slice(HOME.length)
    const b = masker.maskText('~/Documents/vSuite/vCAD/x.md').slice(1)
    expect(a).toBe(b)
  })

  it('stops at the first project folder', () => {
    const { masker } = make()
    const out = masker.maskText(`${H}/clients/acme/app/clients/acme/app`)
    const parts = out.slice(HOME.length + 1).split('/')
    expect(parts.slice(4)).toEqual(['clients', 'acme', 'app'])
  })

  it('keeps a final file name when no project is found', () => {
    const { masker } = make()
    const s = `${H}/real/notes/todo.md`
    const out = idempotent(masker, s)
    expect(out).toMatch(new RegExp(`^${D}/[a-z]+/[a-z]+/todo\\.md$`))
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('masks a folder path that does not exist, every name but a file', () => {
    const { masker } = make()
    const s = `${H}/ghost/deep/place and ${H}/ghost/deep/file.txt`
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/ghost|deep|place/)
    expect(out).toContain('/file.txt')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('hides the folder name itself and leaves other paths alone', () => {
    const { masker } = make()
    const cd = idempotent(masker, `cd ${H}`)
    expect(cd).toMatch(new RegExp(`^cd ${D}$`))
    expect(masker.unmaskText(cd)).toBe(`cd ${H}`)
    expect(masker.maskText('/Users/kf/Downloads/x/y')).toBe('/Users/kf/Downloads/x/y')
    expect(masker.maskText('src/Documents/clients')).toBe('src/Documents/clients')
  })

  it('keeps a trailing full stop out of the name', () => {
    const { masker } = make()
    const s = `it is in ${H}/vSuite/vCAD.`
    const out = idempotent(masker, s)
    expect(out.endsWith('.')).toBe(true)
    expect(out).not.toContain('vCAD')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('gives each hidden folder its own aliases', () => {
    const W = '/Users/kf/Work'
    const { masker } = make({ hiddenFolders: [H, W] }, { isProjectRoot: () => false })
    const a = masker.maskText(`${H}/proj/x`).split('/').slice(4).join('/')
    const b = masker.maskText(`${W}/proj/x`).split('/').slice(4).join('/')
    expect(a).not.toBe(b)
  })

  it('resolves the dash-encoded form to real folders and uses the same aliases', () => {
    const { masker } = make()
    const s = 'dir /Users/kf/.claude/projects/-Users-kf-Documents-vSuite-vCAD/memory/x.md'
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/vSuite|vCAD/)
    expect(out).toMatch(/-Users-kf-[A-Z][a-z]+-v[A-Z][a-z]+-v[A-Z][a-z]+\/memory\/x\.md$/)
    expect(out).not.toContain('Documents')
    expect(masker.unmaskText(out)).toBe(s)
    const [d, a, b] = masker.maskText(`${H}/vSuite/vCAD/x.md`).slice(HOME.length + 1).split('/')
    expect(out).toContain(`-Users-kf-${d}-${a}-${b}/memory`)
  })

  it('keeps real names after the project folder in the dash-encoded form', () => {
    const { masker } = make()
    const s = '-Users-kf-Documents-clients-acme-app-src'
    const out = idempotent(masker, s)
    expect(out).toMatch(/^-Users-kf-[A-Z][a-z]+-[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-src$/)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('aliases an unresolved dash-encoded name as one piece', () => {
    const { masker } = make()
    const s = 'in /Users/kf/.claude/projects/-Users-kf-Documents-ghost-thing/memory'
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/ghost|thing|Documents/)
    expect(out).toContain('-Users-kf-')
    expect(masker.unmaskText(out)).toBe(s)
    expect(roundTrip(masker, '-Users-kf-Documents-ghost-thing.')).toBe('-Users-kf-Documents-ghost-thing.')
  })

  it('hides the username too when asked, and still round trips', () => {
    const { masker } = make({ maskUsername: true })
    const s = `${H}/vSuite/vCAD/x.md`
    const out = idempotent(masker, s)
    expect(out).toMatch(/^\/Users\/dev\/[A-Z][a-z]+\//)
    expect(out).not.toMatch(/vSuite|Documents/)
    expect(masker.unmaskText(out)).toBe(s)
    const dash = idempotent(masker, '/x/.claude/projects/-Users-kf-Documents-vSuite-vCAD/memory')
    expect(dash).toMatch(/-Users-dev-[A-Z][a-z]+-/)
    expect(masker.unmaskText(dash)).toBe('/x/.claude/projects/-Users-kf-Documents-vSuite-vCAD/memory')
  })

  it('hides the username in dash-encoded folders outside hidden folders', () => {
    const { masker } = make({ maskUsername: true, hiddenFolders: [] , root: 'acme-corp' })
    const s = '/x/.claude/projects/-Users-kf-Downloads-thing/memory'
    const out = idempotent(masker, s)
    expect(out).toBe('/x/.claude/projects/-Users-dev-Downloads-thing/memory')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('uses a typed decoy for the folder itself, also when it holds the company root', () => {
    const V = `${H}/vSuite`
    const { masker } = make({ root: 'acme-corp', hiddenFolders: [V], hiddenDecoys: { [V]: `${H}/acme-corp` } })
    const s = `read ${V}/vCAD/README.md in ${V} and -Users-kf-Documents-vSuite-vCAD`
    const out = idempotent(masker, s)
    expect(out).toMatch(new RegExp(`^read ${H}/acme-corp/v[A-Z][a-z]+/README\\.md in ${H}/acme-corp and -Users-kf-Documents-acme-corp-v[A-Z][a-z]+$`))
    expect(out).not.toMatch(/vSuite|vCAD/)
    expect(masker.unmaskText(out)).toBe(s)
    // A path the model makes up under the decoy maps back under the real folder
    expect(masker.unmaskText(`${H}/acme-corp/new-file.md`)).toBe(`${V}/new-file.md`)
  })

  it('hidden folders win over workspace masking, and group masking still applies', () => {
    const { masker } = make({ root: 'acme-corp' }, {
      workspaces: [{ root: H, repos: [{ rel: 'clients/acme/app', remote: 'acme-corp/clients/app' }] }],
    })
    const s = `${H}/clients/acme/app/x.md and acme-corp/clients/app`
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/clients|acme\/|\/app/)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('masks request bodies end to end', () => {
    const { masker } = make()
    const body = { messages: [{ role: 'user', content: [{ type: 'text', text: `cwd ${H}/vSuite/vCAD` }] }] }
    const out = masker.maskBody(body)
    expect(JSON.stringify(out)).not.toContain('vSuite')
    expect(masker.unmaskBody(out)).toEqual(body)
  })
})
