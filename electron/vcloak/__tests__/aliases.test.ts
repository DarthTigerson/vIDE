import { describe, it, expect } from 'vitest'
import { AliasTable, Masker, VcloakLeakError, shapeOf } from '../masker'
import { WORDS } from '../words'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig } from '../types'

const SECRET = Buffer.alloc(32, 7)
const WS = '/Users/kf/work/acme'

function make(cfg: Partial<VcloakConfig> = {}, repos = [{ rel: 'deploy-config', remote: 'acme-corp/infra/deploy-config' }]) {
  const table = new AliasTable(SECRET)
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: 'acme-corp', ...cfg },
    workspaces: [{ root: WS, repos }],
    homeDir: '/Users/kf',
    username: 'kf',
  })
  return { table, masker }
}

describe('vCloak word list', () => {
  it('has plenty of plain lowercase words', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(600)
    expect(new Set(WORDS).size).toBe(WORDS.length)
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,}$/)
    for (const bad of ['foo', 'bar', 'test', 'alias', 'masked', 'hidden', 'secret', 'redacted']) expect(WORDS).not.toContain(bad)
  })
})

describe('vCloak realistic aliases', () => {
  const seg = (real: string) => new AliasTable(SECRET).segment('c', `acme-corp/${real}`, null)

  it('keeps the shape of the real name', () => {
    expect(seg('platform')).toMatch(/^[a-z]+$/)
    expect(seg('my-cool-app')).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
    expect(seg('a-b-c-d-e')).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
    expect(seg('my_app')).toMatch(/^[a-z]+_[a-z]+$/)
    expect(seg('Documents')).toMatch(/^[A-Z][a-z]+$/)
    expect(seg('Team-Floyd')).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+$/)
    expect(seg('vSuite')).toMatch(/^v[A-Z][a-z]+$/)
    expect(seg('vCAD')).toMatch(/^v[A-Z][a-z]+$/)
    expect(seg('CORE')).toMatch(/^[A-Z]+$/)
    expect(seg('api2')).toMatch(/^[a-z]+\d$/)
    expect(seg('prd01')).toMatch(/^[a-z]+\d{2}$/)
    expect(seg('sports-widgets-prd01')).toMatch(/^[a-z]+-[a-z]+-[a-z]+\d{2}$/)
  })

  it('never looks like the old p-codes and never repeats the real name', () => {
    for (const real of ['platform', 'billing', 'atlas', 'orbit', 'core']) {
      const a = seg(real)
      expect(a).not.toMatch(/^p[a-z2-7]{6}$/)
      expect(a).not.toBe(real)
    }
  })

  it('is deterministic per secret and differs per name', () => {
    expect(seg('platform')).toBe(seg('platform'))
    expect(seg('platform')).not.toBe(seg('billing'))
    expect(new AliasTable(Buffer.alloc(32, 9)).segment('c', 'acme-corp/platform', null)).not.toBe(seg('platform'))
  })

  it('describes shapes', () => {
    expect(shapeOf('vSuite').parts[0]).toMatchObject({ style: 'vprefix', lead: 'v' })
    expect(shapeOf('a-b').joiner).toBe('-')
    expect(shapeOf('a_b').joiner).toBe('_')
  })

  it('retries when a candidate is a real path, and gives up eventually', () => {
    const first = seg('platform')
    const t = new AliasTable(SECRET)
    t.isReal = (_k, full) => full === first
    const second = t.segment('c', 'acme-corp/platform', null)
    expect(second).not.toBe(first)
    const stuck = new AliasTable(SECRET)
    stuck.isReal = () => true
    expect(() => stuck.segment('c', 'acme-corp/platform', null)).toThrow(VcloakLeakError)
  })

  it('moves on when two real paths would get the same alias', () => {
    const t = new AliasTable(SECRET)
    const a = t.segment('c', 'acme-corp/platform', null)
    t.remember('c', a, 'acme-corp/other')
    const b = new AliasTable(SECRET, [['c', a, 'acme-corp/other']]).segment('c', 'acme-corp/platform', null)
    expect(b).not.toBe(a)
  })

  it('never aliases a path to a known real repository path', () => {
    const a = new Masker(new AliasTable(SECRET), { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: 'acme-corp' }, workspaces: [], homeDir: '/Users/kf', username: 'kf' })
      .maskText('acme-corp/platform').split('/')[1]
    const { masker } = make({}, [{ rel: 'x', remote: `acme-corp/${a}` }])
    const out = masker.maskText('acme-corp/platform')
    expect(out).not.toBe(`acme-corp/${a}`)
    expect(masker.unmaskText(out)).toBe('acme-corp/platform')
    expect(masker.maskText(`acme-corp/${a}`)).not.toBe(`acme-corp/${a}`)
  })

  it('still unmasks old p-code aliases from stored tables', () => {
    const table = new AliasTable(SECRET, [['c', 'acme-corp/pabcdef/pxyz234', 'acme-corp/platform/billing']])
    const m = new Masker(table, { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: 'acme-corp' }, workspaces: [], homeDir: '/Users/kf', username: 'kf' })
    expect(m.unmaskText('see acme-corp/pabcdef/pxyz234/x.yaml')).toBe('see acme-corp/platform/billing/x.yaml')
  })

  it('restores a single-segment alias only in path context', () => {
    const { masker } = make()
    const alias = masker.maskText(`${WS}/deploy-config`).slice(WS.length + 1)
    expect(alias).toMatch(/^[a-z]+-[a-z]+$/)
    expect(masker.unmaskText(`talk about ${alias} today`)).toBe(`talk about ${alias} today`)
    expect(masker.unmaskText(`open ./${alias}/x`)).toBe('open ./deploy-config/x')
    expect(masker.unmaskText(`${WS}/${alias}`)).toBe(`${WS}/deploy-config`)
    expect(masker.unmaskText(`~/${alias}`)).toBe('~/deploy-config')
  })

  it('restores multi-segment aliases anywhere', () => {
    const { masker } = make()
    const alias = masker.maskText('acme-corp/platform/billing')
    expect(masker.unmaskText(`about ${alias} now`)).toBe('about acme-corp/platform/billing now')
  })
})
