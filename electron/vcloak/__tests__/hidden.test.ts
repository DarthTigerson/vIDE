import { describe, it, expect } from 'vitest'
import { AliasTable, Masker, type MaskerOptions } from '../masker'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig } from '../types'

const SECRET = Buffer.alloc(32, 7)
const HOME = '/Users/sam'
const H = '/Users/sam/Documents'

const PROJECTS = new Set([`${H}/clients/acme/app`, `${H}/qStack/qGEO`, `${H}/Notes/vault`])
const DIRS = new Set([H, `${H}/clients`, `${H}/clients/acme`, `${H}/Notes`, ...PROJECTS, `${H}/real`])
const DASHED: Record<string, string[]> = { 'qStack-qGEO': ['qStack', 'qGEO'], 'clients-acme-app-src': ['clients', 'acme', 'app', 'src'] }

function make(cfg: Partial<VcloakConfig> = {}, extra: Partial<MaskerOptions> = {}) {
  const table = new AliasTable(SECRET)
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [], hiddenFolders: [H], hiddenDepth: 'project', ...cfg },
    workspaces: [],
    homeDir: HOME,
    username: 'sam',
    isProjectRoot: (p) => PROJECTS.has(p),
    isDir: (p) => DIRS.has(p),
    resolveDashed: (h, rest) => (h === H ? DASHED[rest] ?? null : null),
    ...extra,
  })
  return { table, masker }
}

// Auto decoy for H: a made-up sibling of "Documents", e.g. /Users/sam/Harbor
const D = '/Users/sam/[A-Z][A-Za-z]+'
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
    const s = 'see ~/Documents/qStack/qGEO/README.md'
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/qStack|qGEO/)
    expect(out).toMatch(/^see ~\/[A-Z][A-Za-z]+\/[A-Z][A-Za-z]+\/[A-Z][A-Za-z]+\/README\.md$/)
    expect(out).not.toContain('Documents')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('shares aliases between the absolute and ~/ forms', () => {
    const { masker } = make()
    const a = masker.maskText(`${H}/qStack/qGEO/x.md`).slice(HOME.length)
    const b = masker.maskText('~/Documents/qStack/qGEO/x.md').slice(1)
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
    expect(masker.maskText('/Users/sam/Downloads/x/y')).toBe('/Users/sam/Downloads/x/y')
    expect(masker.maskText('src/Documents/clients')).toBe('src/Documents/clients')
  })

  it('keeps a trailing full stop out of the name', () => {
    const { masker } = make()
    const s = `it is in ${H}/qStack/qGEO.`
    const out = idempotent(masker, s)
    expect(out.endsWith('.')).toBe(true)
    expect(out).not.toContain('qGEO')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('gives each hidden folder its own aliases', () => {
    const W = '/Users/sam/Work'
    const { masker } = make({ hiddenFolders: [H, W] }, { isProjectRoot: () => false })
    const a = masker.maskText(`${H}/proj/x`).split('/').slice(4).join('/')
    const b = masker.maskText(`${W}/proj/x`).split('/').slice(4).join('/')
    expect(a).not.toBe(b)
  })

  it('resolves the dash-encoded form to real folders and uses the same aliases', () => {
    const { masker } = make()
    const s = 'dir /Users/sam/.claude/projects/-Users-sam-Documents-qStack-qGEO/memory/x.md'
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/qStack|qGEO/)
    expect(out).toMatch(/-Users-sam-[A-Z][A-Za-z]+-[A-Z][A-Za-z]+-[A-Z][A-Za-z]+\/memory\/x\.md$/)
    expect(out).not.toContain('Documents')
    expect(masker.unmaskText(out)).toBe(s)
    const [d, a, b] = masker.maskText(`${H}/qStack/qGEO/x.md`).slice(HOME.length + 1).split('/')
    expect(out).toContain(`-Users-sam-${d}-${a}-${b}/memory`)
  })

  it('keeps real names after the project folder in the dash-encoded form', () => {
    const { masker } = make()
    const s = '-Users-sam-Documents-clients-acme-app-src'
    const out = idempotent(masker, s)
    expect(out).toMatch(/^-Users-sam-[A-Z][A-Za-z]+-[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-src$/)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('aliases an unresolved dash-encoded name as one piece', () => {
    const { masker } = make()
    const s = 'in /Users/sam/.claude/projects/-Users-sam-Documents-ghost-thing/memory'
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/ghost|thing|Documents/)
    expect(out).toContain('-Users-sam-')
    expect(masker.unmaskText(out)).toBe(s)
    expect(roundTrip(masker, '-Users-sam-Documents-ghost-thing.')).toBe('-Users-sam-Documents-ghost-thing.')
  })

  it('hides the username too when asked, and still round trips', () => {
    const { masker } = make({ maskUsername: true })
    const s = `${H}/qStack/qGEO/x.md`
    const out = idempotent(masker, s)
    expect(out).toMatch(/^\/Users\/dev\/[A-Z][A-Za-z]+\//)
    expect(out).not.toMatch(/qStack|Documents/)
    expect(masker.unmaskText(out)).toBe(s)
    const dash = idempotent(masker, '/x/.claude/projects/-Users-sam-Documents-qStack-qGEO/memory')
    expect(dash).toMatch(/-Users-dev-[A-Z][A-Za-z]+-/)
    expect(masker.unmaskText(dash)).toBe('/x/.claude/projects/-Users-sam-Documents-qStack-qGEO/memory')
  })

  it('hides the username in dash-encoded folders outside hidden folders', () => {
    const { masker } = make({ maskUsername: true, hiddenFolders: [] , roots: [{ path: 'acme-corp', host: 'gitlab' }] })
    const s = '/x/.claude/projects/-Users-sam-Downloads-thing/memory'
    const out = idempotent(masker, s)
    expect(out).toBe('/x/.claude/projects/-Users-dev-Downloads-thing/memory')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('uses a typed decoy for the folder itself, also when it holds the company root', () => {
    const V = `${H}/qStack`
    const { masker } = make({ roots: [{ path: 'acme-corp', host: 'gitlab' }], hiddenFolders: [V], hiddenDecoys: { [V]: `${H}/acme-corp` } })
    const s = `read ${V}/qGEO/README.md in ${V} and -Users-sam-Documents-qStack-qGEO`
    const out = idempotent(masker, s)
    expect(out).toMatch(new RegExp(`^read ${H}/acme-corp/[A-Z][A-Za-z]+/README\\.md in ${H}/acme-corp and -Users-sam-Documents-acme-corp-[A-Z][A-Za-z]+$`))
    expect(out).not.toMatch(/qStack|qGEO/)
    expect(masker.unmaskText(out)).toBe(s)
    // A path the model makes up under the decoy maps back under the real folder
    expect(masker.unmaskText(`${H}/acme-corp/new-file.md`)).toBe(`${V}/new-file.md`)
  })

  it('hidden folders win over workspace masking, and group masking still applies', () => {
    const { masker } = make({ roots: [{ path: 'acme-corp', host: 'gitlab' }] }, {
      workspaces: [{ root: H, repos: [{ rel: 'clients/acme/app', remote: 'acme-corp/clients/app' }] }],
    })
    const s = `${H}/clients/acme/app/x.md and acme-corp/clients/app`
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/clients|acme\/|\/app/)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('masks request bodies end to end', () => {
    const { masker } = make()
    const body = { messages: [{ role: 'user', content: [{ type: 'text', text: `cwd ${H}/qStack/qGEO` }] }] }
    const out = masker.maskBody(body)
    expect(JSON.stringify(out)).not.toContain('qStack')
    expect(masker.unmaskBody(out)).toEqual(body)
  })

  it('hides every name below, file types too, at depth "all"', () => {
    const { masker } = make({ hiddenDepth: 'all' })
    const s = `${H}/qStack/qGEO/src/main.ts and ${H}/qStack/qGEO/test`
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/qStack|qGEO|src|main|\.ts|test|Documents/)
    expect(out).toMatch(new RegExp(`^${D}/[A-Z][A-Za-z]+/[A-Z][A-Za-z]+/[a-z]+/[a-z]+ and ${D}/[A-Z][A-Za-z]+/[A-Z][A-Za-z]+/[a-z]+$`))
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('keeps only the file type at depth "all-keep-ext"', () => {
    const { masker } = make({ hiddenDepth: 'all-keep-ext' })
    const s = `${H}/qStack/qGEO/src/main.ts`
    const out = idempotent(masker, s)
    expect(out).not.toMatch(/qStack|qGEO|src|main/)
    expect(out).toMatch(/\/[a-z]+\.ts$/)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('hides the folder and one level below at depth "one"', () => {
    const { masker } = make({ hiddenDepth: 'one' })
    const s = `${H}/qStack/qGEO/src/main.ts`
    const out = idempotent(masker, s)
    expect(out).toMatch(new RegExp(`^${D}/[A-Z][A-Za-z]+/qGEO/src/main\\.ts$`))
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('restores a hidden alias after the real parent folder too', () => {
    const { masker } = make({ hiddenDepth: 'one' })
    const out = masker.maskText(`${H}/qStack/qGEO/x.md`)
    const alias = out.slice(HOME.length + 1).split('/')[1]
    expect(masker.unmaskText(`ls "$HDIR"/${alias}/qGEO`)).toBe('ls "$HDIR"/qStack/qGEO')
    expect(masker.unmaskText(`the word ${alias} alone`)).toBe(`the word ${alias} alone`)
  })

  it('hides the username on its own, one way', () => {
    const { masker } = make({ maskUsername: true, hiddenFolders: [], roots: [{ path: 'acme-corp', host: 'gitlab' }] })
    expect(masker.maskText('-rw-r--r--  1 sam  staff  12 x.md')).toBe('-rw-r--r--  1 sam  staff  12 x.md')
  })

  it('replaces a longer username in an ls owner column', () => {
    const { masker } = make({ maskUsername: true, hiddenFolders: [], roots: [{ path: 'acme-corp', host: 'gitlab' }] }, { username: 'pjordan', homeDir: '/Users/pjordan' })
    const out = masker.maskText('-rw-r--r--  1 pjordan  staff  12 /Users/pjordan/x.md')
    expect(out).toBe('-rw-r--r--  1 dev  staff  12 /Users/dev/x.md')
    expect(masker.maskText(out)).toBe(out)
  })
})
