import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AliasTable, Masker, type MaskerOptions } from '../masker'
import { VcloakManager } from '../index'
import { VcloakStore, validateConfig, migrateLegacyRoot, type Sealer } from '../store'
import { discoverRepos } from '../sources'
import { normaliseRepoInput, normaliseRoot, guessHost } from '../normalise'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig, type VcloakRoot } from '../types'

const SECRET = Buffer.alloc(32, 9)
const GL: VcloakRoot = { path: 'acme-corp', host: 'gitlab' }
const GH: VcloakRoot = { path: 'acme-org', host: 'github' }

function make(cfg: Partial<VcloakConfig> = {}, extra: Partial<MaskerOptions> = {}) {
  const table = new AliasTable(SECRET)
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [GL, GH], ...cfg },
    workspaces: [],
    homeDir: '/Users/you',
    username: 'you',
    ...extra,
  })
  return { table, masker }
}

describe('vCloak roots: github', () => {
  it('masks only the repo segment and keeps the route after it', () => {
    const { masker } = make()
    const out = masker.maskText('https://github.com/acme-org/secret-repo/blob/main/README.md')
    expect(out).toMatch(/^https:\/\/github\.com\/acme-org\/[a-z-]+\/blob\/main\/README\.md$/)
    expect(out).not.toContain('secret-repo')
  })

  it.each([
    'https://github.com/acme-org/secret-repo/blob/main/README.md',
    'https://github.com/acme-org/secret-repo/tree/feature-x/src',
    'https://github.com/acme-org/secret-repo/pull/12',
    'https://github.com/acme-org/secret-repo/issues',
    'https://github.com/acme-org/secret-repo/actions',
    'https://github.com/acme-org/secret-repo/wiki',
    'https://github.com/acme-org/secret-repo/releases',
    'https://github.com/acme-org/secret-repo.git',
    'git@github.com:acme-org/secret-repo.git',
    'https://api.github.com/repos/acme-org/secret-repo/issues/3',
    'https://raw.githubusercontent.com/acme-org/secret-repo/main/src/x.ts',
    'see acme-org/secret-repo for details',
    'it is acme-org/secret-repo.',
  ])('is reversible and idempotent: %s', (s) => {
    const { masker } = make()
    const out = masker.maskText(s)
    expect(out).not.toContain('secret-repo')
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('keeps the path after the repo', () => {
    const { masker } = make()
    expect(masker.maskText('https://api.github.com/repos/acme-org/secret-repo/pulls/4')).toMatch(/\/pulls\/4$/)
    expect(masker.maskText('https://raw.githubusercontent.com/acme-org/secret-repo/main/a/b.md')).toMatch(/\/main\/a\/b\.md$/)
    expect(masker.maskText('git@github.com:acme-org/secret-repo.git')).toMatch(/\.git$/)
  })

  it('treats "other" like github', () => {
    const { masker } = make({ roots: [{ path: 'acme-team', host: 'other' }] })
    const s = 'https://bitbucket.example.com/acme-team/secret-repo/src/main/x.txt'
    const out = masker.maskText(s)
    expect(out).toMatch(/\/src\/main\/x\.txt$/)
    expect(out).not.toContain('secret-repo')
    expect(masker.unmaskText(out)).toBe(s)
  })
})

describe('vCloak roots: several roots', () => {
  it('masks a gitlab and a github root in one text', () => {
    const { masker } = make()
    const s = 'a acme-corp/platform/billing b https://github.com/acme-org/secret-repo/pull/9 c'
    const out = masker.maskText(s)
    expect(out).not.toMatch(/platform|billing|secret-repo/)
    expect(out).toContain('/pull/9')
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('maskRoot hides every root', () => {
    const { masker } = make({ maskRoot: true })
    const s = 'acme-corp/platform/billing and acme-org/secret-repo/blob/main/x'
    const out = masker.maskText(s)
    expect(out).not.toMatch(/acme-corp|acme-org|platform|billing|secret-repo/)
    expect(out).toContain('/blob/main/x')
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('is active with roots only', () => {
    expect(make().masker.active).toBe(true)
    expect(make({ roots: [] }).masker.active).toBe(false)
  })

  it('keeps old gitlab aliases working (alias key is the group path)', () => {
    const a = make({ roots: [GL] })
    const out = a.masker.maskText('acme-corp/platform/billing')
    const b = new Masker(new AliasTable(SECRET, a.table.entries()), { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [GL, GH] }, workspaces: [], homeDir: '/Users/you', username: 'you' })
    expect(b.unmaskText(out)).toBe('acme-corp/platform/billing')
  })

  it('applies exceptions under a github root', () => {
    const { masker } = make({ mode: 'all-except', exceptions: ['acme-org/public-repo'] })
    expect(masker.maskText('acme-org/public-repo/blob/main/x')).toBe('acme-org/public-repo/blob/main/x')
    expect(masker.maskText('acme-org/secret-repo')).not.toContain('secret-repo')
  })

  it('applies selective rules under a github root', () => {
    const { masker } = make({ mode: 'selective', rules: [{ real: 'acme-org/secret-repo', decoy: 'acme-org/harbor' }] })
    const out = masker.maskText('acme-org/secret-repo/pull/2 and acme-org/other')
    expect(out).toBe('acme-org/harbor/pull/2 and acme-org/other')
    expect(masker.unmaskText(out)).toBe('acme-org/secret-repo/pull/2 and acme-org/other')
  })
})

describe('vCloak roots: validation and migration', () => {
  const base = { ...DEFAULT_VCLOAK_CONFIG, roots: [GL, GH] }
  it('validates the roots list', () => {
    expect(validateConfig(base)).toBeNull()
    expect(validateConfig({ ...base, roots: Array.from({ length: 21 }, (_, i) => ({ path: `r${i}`, host: 'gitlab' as const })) })).toMatch(/At most 20/)
    expect(validateConfig({ ...base, roots: [{ path: 'bad root!', host: 'gitlab' }] })).toMatch(/Company root/)
    expect(validateConfig({ ...base, roots: [{ path: 'a/b', host: 'github' }] })).toMatch(/single name/)
    expect(validateConfig({ ...base, roots: [{ path: 'a/b', host: 'gitlab' }] })).toBeNull()
    expect(validateConfig({ ...base, roots: [GL, GL] })).toMatch(/twice/)
    expect(validateConfig({ ...base, roots: [GL, { path: 'acme-corp/sub', host: 'gitlab' }] })).toMatch(/overlap/)
    expect(validateConfig({ ...base, roots: [{ path: 'x', host: 'svn' as never }] })).toMatch(/host/)
    expect(validateConfig({ ...base, roots: 'x' as never })).toMatch(/Invalid company roots/)
  })

  it('needs a root or a hidden folder to turn on', () => {
    expect(validateConfig({ ...base, roots: [], enabled: true })).toBe('Enter a company root or a hidden local folder before turning vCloak on')
  })

  it('checks exceptions, rules and decoys against the roots', () => {
    expect(validateConfig({ ...base, exceptions: ['acme-org/repo'] })).toBeNull()
    expect(validateConfig({ ...base, exceptions: ['acme-org/repo/sub'] })).toMatch(/owner\/repo/)
    expect(validateConfig({ ...base, exceptions: ['other/repo'] })).toMatch(/acme-corp, acme-org/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-org/a', decoy: 'acme-org/b' }] })).toBeNull()
    expect(validateConfig({ ...base, rules: [{ real: 'acme-org/a', decoy: 'acme-corp/b' }] })).toMatch(/same root/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-org/a', decoy: 'acme-org' }] })).toMatch(/Decoy/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-corp/a/b', decoy: 'acme-corp/x/y' }] })).toBeNull()
  })

  it('migrates a legacy root', () => {
    expect(migrateLegacyRoot({ root: 'acme-corp' })).toEqual({ roots: [GL] })
    expect(migrateLegacyRoot({ root: '' })).toEqual({})
    expect(migrateLegacyRoot({ root: 'old', roots: [GH] })).toEqual({ roots: [GH] })
  })
})

describe('vCloak roots: store and manager', () => {
  let tmp: string
  const sealer: Sealer = {
    available: () => true,
    seal: (s) => Buffer.from('S:' + Buffer.from(s).toString('base64')),
    open: (b) => Buffer.from(b.toString().slice(2), 'base64').toString(),
  }
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcloak-roots-')) })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  it('loads an old saved config with a single root', () => {
    const store = new VcloakStore(join(tmp, 'vc'), sealer)
    store.saveConfig({ ...DEFAULT_VCLOAK_CONFIG, root: 'acme-corp', enabled: true } as unknown as VcloakConfig)
    const { config, error } = store.loadConfig()
    expect(error).toBeUndefined()
    expect(config.roots).toEqual([GL])
    expect('root' in config).toBe(false)
    expect(config.enabled).toBe(true)
  })

  it('accepts a legacy root patch and normalises pasted roots', async () => {
    const m = new VcloakManager({ dir: join(tmp, 'vc'), sealer, rgPath: async () => null, homeDir: '/Users/you', username: 'you' })
    expect(await m.setConfig({ root: 'https://gitlab.com/acme-corp/sub/' } as never)).toMatchObject({ ok: true })
    expect(m.state().config.roots).toEqual([{ path: 'acme-corp/sub', host: 'gitlab' }])
    expect(await m.setConfig({ roots: [{ path: 'https://github.com/acme-org/repo', host: 'github' }, GL] })).toMatchObject({ ok: true })
    expect(m.state().config.roots).toEqual([GH, GL])
    expect(m.generateDecoy('acme-org/repo')).toMatch(/^acme-org\/[a-z]+$/)
    expect(m.generateDecoy('acme-corp/a/b')).toMatch(/^acme-corp\/[a-z]+\/[a-z]+$/)
    await m.dispose()
  })

  it('normalises rules under a github root to owner/repo', async () => {
    const m = new VcloakManager({ dir: join(tmp, 'vc'), sealer, rgPath: async () => null, homeDir: '/Users/you', username: 'you' })
    const r = await m.setConfig({ roots: [GH, GL], mode: 'all-except', exceptions: ['https://github.com/acme-org/open-repo/blob/main/x'] })
    expect(r).toMatchObject({ ok: true })
    expect(m.state().config.exceptions).toEqual(['acme-org/open-repo'])
    await m.dispose()
  })

  it('discovers repos under any root, owner/repo only for github', async () => {
    const ws = join(tmp, 'ws')
    const repo = (rel: string, url: string) => {
      mkdirSync(join(ws, rel, '.git'), { recursive: true })
      writeFileSync(join(ws, rel, '.git', 'config'), `[remote "origin"]\n\turl = ${url}\n`)
    }
    repo('a', 'git@gitlab.com:acme-corp/platform/billing/api.git')
    repo('b', 'https://github.com/acme-org/secret-repo.git')
    repo('c', 'https://github.com/other/lib.git')
    repo('d', 'git@github.com:acme-corp/gl-named-the-same.git')
    mkdirSync(join(ws, 'graphify-out'))
    writeFileSync(join(ws, 'graphify-out', 'manifest.json'), JSON.stringify({ 'a/x.go': {}, 'b/y.ts': {}, 'c/z.js': {}, 'd/w.js': {} }))
    const r = await discoverRepos(ws, [GL, GH], null)
    expect(r.repos.map((x) => `${x.rel}=${x.remote}`).sort()).toEqual([
      'a=acme-corp/platform/billing/api',
      'b=acme-org/secret-repo',
      'd=acme-corp/gl-named-the-same',
    ])
  })
})

describe('vCloak roots: normalise', () => {
  it('normaliseRoot takes pasted links', () => {
    expect(normaliseRoot('https://github.com/acme-org')).toBe('acme-org')
    expect(normaliseRoot('https://github.com/acme-org/repo')).toBe('acme-org')
    expect(normaliseRoot('https://gitlab.com/acme-corp/sub')).toBe('acme-corp/sub')
    expect(normaliseRoot(' acme-corp/ ')).toBe('acme-corp')
  })

  it('guessHost reads the host of a link', () => {
    expect(guessHost('https://github.com/acme-org')).toBe('github')
    expect(guessHost('git@github.com:acme-org/repo.git')).toBe('github')
    expect(guessHost('https://gitlab.com/acme-corp')).toBe('gitlab')
    expect(guessHost('https://gitlab.example.com/acme-corp')).toBe('gitlab')
    expect(guessHost('https://bitbucket.org/acme-team')).toBeNull()
    expect(guessHost('acme-corp')).toBeNull()
    expect(guessHost('')).toBeNull()
  })

  it('normaliseRepoInput with one root prefixes it', () => {
    expect(normaliseRepoInput('platform/api', [GL])).toEqual({ ok: true, value: 'acme-corp/platform/api' })
    expect(normaliseRepoInput('repo', [GH])).toEqual({ ok: true, value: 'acme-org/repo' })
  })

  it('normaliseRepoInput with several roots needs the full path', () => {
    expect(normaliseRepoInput('platform/api', [GL, GH])).toEqual({ ok: false, error: 'Write the full path including its root, for example acme-corp/platform/api' })
    expect(normaliseRepoInput('acme-org/repo', [GL, GH])).toEqual({ ok: true, value: 'acme-org/repo' })
  })

  it('normaliseRepoInput maps links from any host to their path', () => {
    expect(normaliseRepoInput('https://github.com/acme-org/repo/blob/main/README.md', [GL, GH])).toEqual({ ok: true, value: 'acme-org/repo' })
    expect(normaliseRepoInput('git@github.com:acme-org/repo.git', [GL, GH])).toEqual({ ok: true, value: 'acme-org/repo' })
    expect(normaliseRepoInput('https://gitlab.com/acme-corp/platform/billing/-/tree/main', [GL, GH])).toEqual({ ok: true, value: 'acme-corp/platform/billing' })
  })

  it('leaves GitHub org pages alone', () => {
    const table = new AliasTable(Buffer.alloc(32, 3))
    const m = new Masker(table, { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-org', host: 'github' }] }, workspaces: [], homeDir: '/Users/you', username: 'you' })
    expect(m.maskText('https://github.com/orgs/acme-org/people')).toBe('https://github.com/orgs/acme-org/people')
    expect(m.maskText('https://github.com/acme-org/app/pulls')).not.toContain('/app/')
  })

  it('restores a lone hidden root name in plain prose', () => {
    const table = new AliasTable(Buffer.alloc(32, 4))
    const m = new Masker(table, { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, maskRoot: true, roots: [{ path: 'acme-corp', host: 'gitlab' }] }, workspaces: [], homeDir: '/Users/you', username: 'you' })
    const s = 'The acme-corp team owns acme-corp/platform.'
    const out = m.maskText(s)
    expect(out).not.toContain('acme-corp')
    expect(m.unmaskText(out)).toBe(s)
  })

  it('masks a known GitLab repo path whole and keeps file paths after it real', () => {
    const table = new AliasTable(Buffer.alloc(32, 5))
    const m = new Masker(table, {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-corp', host: 'gitlab' }] },
      workspaces: [{ root: '/Users/you/ws', repos: [{ rel: 'devops/kubernetes', remote: 'acme-corp/devops/kubernetes' }] }],
      homeDir: '/Users/you', username: 'you',
    })
    const s = 'see acme-corp/devops/kubernetes/wiki/README.md and git@gitlab.com:acme-corp/devops/kubernetes.git'
    const out = m.maskText(s)
    expect(out).not.toMatch(/devops|kubernetes/)
    expect(out).toMatch(/^see acme-corp\/[a-z]+\/[a-z]+\/wiki\/README\.md and git@gitlab\.com:acme-corp\/[a-z]+\/[a-z]+\.git$/)
    expect(m.maskText(out)).toBe(out)
    expect(m.unmaskText(out)).toBe(s)
  })

  it('hides distinctive repo and folder names standing alone, not ordinary words', () => {
    const table = new AliasTable(Buffer.alloc(32, 6))
    const m = new Masker(table, {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-corp', host: 'gitlab' }], hiddenFolders: ['/Users/you/Documents/Projects'] },
      workspaces: [{ root: '/Users/you/ws', repos: [{ rel: 'core/sports-api', remote: 'acme-corp/core/sports-api' }, { rel: 'core/docs', remote: 'acme-corp/core/docs' }] }],
      homeDir: '/Users/you', username: 'you',
      listDir: (p) => (p === '/Users/you/Documents/Projects' ? ['MegaTool', 'notes'] : []),
    })
    const s = '# sports-api\nDeploy sports-api, MegaTool and Projects. Update the docs and core notes.'
    const out = m.maskText(s)
    expect(out).not.toMatch(/sports-api|MegaTool/)
    expect(out).toContain('Update the docs and core notes.')
    expect(m.maskText(out)).toBe(out)
    expect(m.unmaskText(out)).toBe(s)
  })
})

describe('vCloak roots: owner position and hidden names', () => {
  const H = '/Users/you/Documents/Projects'
  // A GitHub root that is really a repo name, also a folder in a hidden folder
  const ROOTS: VcloakRoot[] = [GL, { path: 'MegaTool', host: 'github' }, { path: 'SideKick', host: 'github' }]
  const ws = '/Users/you/work/space'
  const opts: Partial<MaskerOptions> = {
    workspaces: [{ root: ws, repos: [{ rel: 'Widgetry', remote: 'acme-corp/design/widgetry' }] }],
    listDir: (p) => (p === H ? ['MegaTool', 'SideKick'] : []),
    exists: (p) => p === H || p === `${H}/MegaTool` || p === `${H}/SideKick`,
    isDir: (p) => p === H || p === `${H}/MegaTool` || p === `${H}/SideKick`,
  }

  it('matches a GitHub owner only after a host, at the start, or after an API route', () => {
    const { masker } = make({ roots: [GH] })
    expect(masker.maskText('https://github.com/acme-org/secret-repo/pull/1')).not.toContain('secret-repo')
    expect(masker.maskText('acme-org/secret-repo')).not.toContain('secret-repo')
    expect(masker.maskText('https://api.github.com/repos/acme-org/secret-repo/issues/3')).not.toContain('secret-repo')
    // someone-else/acme-org/pull: acme-org is a repo here, not the owner
    expect(masker.maskText('https://github.com/someone/acme-org/pull/162')).toBe('https://github.com/someone/acme-org/pull/162')
  })

  it.each([false, true])('is stable when a root name is also a hidden-folder name (hide root: %s)', (maskRoot) => {
    const { masker } = make({ roots: ROOTS, maskRoot, hiddenFolders: [H], maskLocalFolders: true }, opts)
    const s = 'decoys Widgetry/MegaTool/SideKick do not; PR https://github.com/someone/MegaTool/pull/162 and `MegaTool/src` + MegaTool alone'
    const out = masker.maskText(s)
    expect(out).not.toMatch(/MegaTool|SideKick|Widgetry/)
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })
})
