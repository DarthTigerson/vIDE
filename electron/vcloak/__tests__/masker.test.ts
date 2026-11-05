import { describe, it, expect } from 'vitest'
import { AliasTable, Masker, VcloakLeakError, walk, type MaskerOptions } from '../masker'
import { DEFAULT_VCLOAK_CONFIG, type VcloakConfig } from '../types'

const SECRET = Buffer.alloc(32, 7)
const WS = '/Users/kf/work/acme'

function make(cfg: Partial<VcloakConfig> = {}, extra: Partial<MaskerOptions> = {}) {
  const table = new AliasTable(SECRET)
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: 'acme-corp', ...cfg },
    workspaces: [{
      root: WS,
      repos: [
        { rel: 'platform/billing/payments/invoice-api', remote: 'acme-corp/platform/billing/payments/invoice-api' },
        { rel: 'deploy-config', remote: 'acme-corp/infra/deploy-config' },
        { rel: 'ops/public-docs', remote: 'acme-corp/ops/public-docs' },
      ],
    }],
    homeDir: '/Users/kf',
    username: 'kf',
    ...extra,
  })
  return { table, masker }
}

const roundTrip = (m: Masker, s: string) => m.unmaskText(m.maskText(s))

describe('vCloak masker: mask all', () => {
  it('hides every segment under the root and keeps the root', () => {
    const { masker } = make()
    const out = masker.maskText('see acme-corp/platform/billing/payments/invoice-api now')
    expect(out).not.toMatch(/platform|billing|payments/)
    expect(out).toMatch(/^see acme-corp\/[a-z]+\/[a-z]+\/[a-z]+\/[a-z]+-[a-z]+ now$/)
    expect(out).not.toMatch(/\bp[a-z2-7]{6}\b/)
  })

  it('is deterministic and reversible', () => {
    const { masker } = make()
    const s = 'acme-corp/platform/billing'
    expect(masker.maskText(s)).toBe(masker.maskText(s))
    expect(roundTrip(masker, s)).toBe(s)
  })

  it('gives a shared parent the same alias', () => {
    const { masker } = make()
    const a = masker.maskText('acme-corp/platform/a').split('/')
    const b = masker.maskText('acme-corp/platform/b').split('/')
    expect(a[1]).toBe(b[1])
    expect(a[2]).not.toBe(b[2])
  })

  it.each([
    'https://gitlab.com/acme-corp/platform/billing/-/merge_requests/12',
    'git@gitlab.com:acme-corp/platform/billing.git',
    'glab api projects/acme-corp%2Fplatform%2Fbilling',
    'registry.gitlab.com/acme-corp/platform/billing/api:1.2.3',
    'path is acme-corp/platform/billing.',
  ])('covers every form: %s', (s) => {
    const { masker } = make()
    const out = masker.maskText(s)
    expect(out).not.toMatch(/platform|billing/)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('keeps GitLab /-/ routes and suffixes intact', () => {
    const { masker } = make()
    expect(masker.maskText('https://gitlab.com/acme-corp/x/-/blob/main/README.md')).toMatch(/\/-\/blob\/main\/README\.md$/)
    expect(masker.maskText('git@gitlab.com:acme-corp/x.git')).toMatch(/\.git$/)
    expect(masker.maskText('acme-corp%2Fplatform')).toMatch(/^acme-corp%2F[a-z]+$/)
  })

  it('leaves text outside the root untouched', () => {
    const { masker } = make()
    const s = 'github.com/other-org/platform and acme-corp-x/foo and src/core/x'
    expect(masker.maskText(s)).toBe(s)
  })

  it('can hide the root too', () => {
    const { masker } = make({ maskRoot: true })
    const s = 'repo acme-corp/platform and org /acme-corp'
    const out = masker.maskText(s)
    expect(out).not.toContain('acme-corp')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('restores paths the model extends with new files', () => {
    const { masker } = make()
    const alias = masker.maskText('acme-corp/platform/billing')
    expect(masker.unmaskText(`${alias}/new-file.yaml`)).toBe('acme-corp/platform/billing/new-file.yaml')
  })

  it('does nothing when disabled', () => {
    const { masker } = make({ enabled: false })
    expect(masker.maskText('acme-corp/platform')).toBe('acme-corp/platform')
  })
})

describe('vCloak masker: exceptions and selective', () => {
  it('leaves exceptions visible in all-except mode', () => {
    const { masker } = make({ mode: 'all-except', exceptions: ['acme-corp/ops/public-docs'] })
    expect(masker.maskText('acme-corp/ops/public-docs/x')).toBe('acme-corp/ops/public-docs/x')
    expect(masker.maskText('acme-corp/ops/secret')).not.toContain('secret')
  })

  it('only hides chosen paths in selective mode, using the decoy', () => {
    const { masker } = make({ mode: 'selective', rules: [{ real: 'acme-corp/platform/billing', decoy: 'acme-corp/zq7/kx2' }] })
    expect(masker.maskText('acme-corp/platform/billing')).toBe('acme-corp/zq7/kx2')
    const deep = masker.maskText('acme-corp/platform/billing/payments')
    expect(deep).toMatch(/^acme-corp\/zq7\/kx2\/[a-z]+$/)
    expect(masker.maskText('acme-corp/platform/other')).toBe('acme-corp/platform/other')
    expect(masker.unmaskText(deep)).toBe('acme-corp/platform/billing/payments')
  })
})

describe('vCloak masker: local folders and username', () => {
  it('masks absolute workspace paths to known repos only', () => {
    const { masker } = make()
    const s = `${WS}/platform/billing/payments/invoice-api/kustomization.yaml and ${WS}/graphify-out/x`
    const out = masker.maskText(s)
    expect(out).not.toMatch(/platform|billing|invoice-api/)
    expect(out).toContain(`${WS}/graphify-out/x`)
    expect(out).toContain('/kustomization.yaml')
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('masks bare relative and ~/ paths', () => {
    const { masker } = make()
    for (const s of ['platform/billing/foo.yaml', './deploy-config/base', '~/work/acme/deploy-config/x']) {
      const out = masker.maskText(s)
      expect(out).not.toMatch(/platform|billing|deploy-config/)
      expect(masker.unmaskText(out)).toBe(s)
    }
  })

  it('does not mask a lone common word or a nested folder of the same name', () => {
    const { masker } = make()
    expect(masker.maskText('we use ops daily')).toBe('we use ops daily')
    expect(masker.maskText('src/platform/billing')).toBe('src/platform/billing')
  })

  it('uses the remote for exceptions on local folders', () => {
    const { masker } = make({ mode: 'all-except', exceptions: ['acme-corp/infra/deploy-config'] })
    expect(masker.maskText(`${WS}/deploy-config/x`)).toBe(`${WS}/deploy-config/x`)
  })

  it('hides the username when asked', () => {
    const { masker } = make({ maskUsername: true, maskLocalFolders: false })
    expect(masker.maskText('/Users/kf/notes.md')).toBe('/Users/dev/notes.md')
    expect(masker.unmaskText('/Users/dev/notes.md')).toBe('/Users/kf/notes.md')
  })

  it('leaves local folders alone when that option is off', () => {
    const { masker } = make({ maskLocalFolders: false })
    expect(masker.maskText(`${WS}/deploy-config/x`)).toBe(`${WS}/deploy-config/x`)
  })
})

describe('vCloak masker: bodies and safety', () => {
  it('masks request bodies but never thinking blocks, ids or signatures', () => {
    const { masker } = make()
    const body = {
      model: 'claude-opus',
      system: [{ type: 'text', text: 'cwd acme-corp/platform' }],
      messages: [{
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'acme-corp/platform', signature: 'sig' },
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: `${WS}/deploy-config/a.yaml` } },
        ],
      }],
    }
    const out = masker.maskBody(body)
    expect(out.system[0].text).not.toContain('platform')
    expect(out.messages[0].content[0]).toBe(body.messages[0].content[0])
    expect((out.messages[0].content[1] as { input: { file_path: string } }).input.file_path).not.toContain('deploy-config')
    expect((out.messages[0].content[1] as { id: string }).id).toBe('toolu_1')
    expect(masker.unmaskBody(out)).toEqual(body)
  })

  it('blocks when masking is not stable', () => {
    const { masker } = make()
    // Force an inconsistent state: mask once, then wipe the alias memory
    const sneaky = masker as unknown as { maskOnce: (s: string) => string }
    const original = sneaky.maskOnce.bind(masker)
    let calls = 0
    sneaky.maskOnce = (s: string) => (++calls === 1 ? s : original(s))
    expect(() => masker.maskText('acme-corp/platform')).toThrow(VcloakLeakError)
  })

  it('persists aliases through the table entries', () => {
    const { masker, table } = make()
    const out = masker.maskText('acme-corp/platform/billing')
    const restored = new AliasTable(SECRET, table.entries())
    const m2 = new Masker(restored, { config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: 'acme-corp' }, workspaces: [], homeDir: '/Users/kf', username: 'kf' })
    expect(m2.unmaskText(out)).toBe('acme-corp/platform/billing')
  })

  it('walk leaves non-string values alone', () => {
    expect(walk({ a: 1, b: null, c: [true] }, (s) => s + '!')).toEqual({ a: 1, b: null, c: [true] })
  })
})
