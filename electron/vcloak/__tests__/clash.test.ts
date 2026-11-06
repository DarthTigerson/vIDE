import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AliasTable, Masker } from '../masker'
import { VcloakStore, type Sealer } from '../store'
import { VcloakManager } from '../index'
import { DEFAULT_VCLOAK_CONFIG } from '../types'

const SECRET = Buffer.alloc(32, 9)
const H = '/Users/you/Documents/proj'

function make(table: AliasTable, real: Set<string>) {
  return new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, hiddenFolders: [H], hiddenDepth: 'all' },
    workspaces: [],
    homeDir: '/Users/you',
    username: 'you',
    isDir: (p) => p === H || p === `${H}/app`,
    exists: (p) => real.has(p),
  })
}

describe('vCloak hidden aliases never clash with real names', () => {
  it('rejects a made-up name that exists next to the real file', () => {
    const real = new Set([H, `${H}/app`, `${H}/app/foo.ts`])
    const first = make(new AliasTable(SECRET), real).maskText(`${H}/app/foo.ts`).split('/').pop() as string
    // Same secret, but now a real file carries the name that was picked first
    real.add(`${H}/app/${first}`)
    const t2 = new AliasTable(SECRET)
    const m2 = make(t2, real)
    const out = m2.maskText(`${H}/app/foo.ts`)
    expect(out.split('/').pop()).not.toBe(first)
    // A real sibling typed under the alias folder is not turned into foo.ts
    const aliasDir = out.split('/').slice(0, -1).join('/')
    expect(m2.unmaskText(`${aliasDir}/${first}`)).not.toContain('foo.ts')
    expect(m2.unmaskText(out)).toBe(`${H}/app/foo.ts`)
  })

  it('drops stored aliases that clash with a real sibling', () => {
    const real = new Set([H, `${H}/app`, `${H}/app/foo.ts`, `${H}/app/index.ts`])
    const table = new AliasTable(SECRET, [['h', 'Harbor', 'app'], ['h', 'Harbor/index.ts', 'app/foo.ts']])
    const m = make(table, real)
    expect(table.real('h', 'Harbor/index.ts')).toBeUndefined()
    expect(table.real('h', 'Harbor')).toBe('app')
    expect(m.unmaskText('/Users/you/Documents/Ledger/Harbor/index.ts')).not.toContain('foo.ts')
  })
})

describe('vCloak stays closed without the Keychain', () => {
  let dir = ''
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })
  const sealer = (ok: boolean): Sealer => ({ available: () => ok, seal: (p) => Buffer.from(p), open: (b) => b.toString() })

  it('remembers that it was on and blocks sessions', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vcloak-kc-'))
    new VcloakStore(dir, sealer(true)).saveConfig({ ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-corp', host: 'gitlab' }] })
    const { config, error } = new VcloakStore(dir, sealer(false)).loadConfig()
    expect(config.enabled).toBe(true)
    expect(error).toMatch(/Keychain/)
    const m = new VcloakManager({ dir, sealer: sealer(false), rgPath: async () => null })
    await m.init()
    const spawn = await m.prepareSpawn('/tmp')
    expect(spawn).toMatchObject({ ok: false })
    await m.dispose()
  })

  it('stays off when it was off', () => {
    dir = mkdtempSync(join(tmpdir(), 'vcloak-kc-'))
    new VcloakStore(dir, sealer(true)).saveConfig({ ...DEFAULT_VCLOAK_CONFIG, enabled: false })
    expect(new VcloakStore(dir, sealer(false)).loadConfig()).toEqual({ config: DEFAULT_VCLOAK_CONFIG })
  })
})
