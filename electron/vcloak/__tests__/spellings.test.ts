import { describe, it, expect } from 'vitest'
import { AliasTable, Masker } from '../masker'
import { DEFAULT_VCLOAK_CONFIG } from '../types'

const H = '/Users/you/Documents/Projects'
const WS = '/Users/you/work/AcmeApps'

function make() {
  const table = new AliasTable(Buffer.alloc(32, 9))
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-corp', host: 'gitlab' }], hiddenFolders: [H], hiddenDepth: 'one', hidePlainNames: true, maskUsername: true },
    workspaces: [{ root: WS, repos: [
      { rel: 'core/sports-api', remote: 'acme-corp/core/sports-api' },
      { rel: 'legacy-repos/billing-api', remote: 'acme-corp/billing/billing-api' },
      { rel: 'zorbleton/web', remote: 'acme-corp/zorbleton/web' },
    ] }],
    homeDir: '/Users/you', username: 'you',
    listDir: (p) => (p === H ? ['MegaTool'] : []),
    exists: (p) => p === `${H}/MegaTool` || p === H,
    isDir: (p) => p === `${H}/MegaTool` || p === H,
    isWord: (w) => ['core', 'web', 'billing', 'notes', 'project', 'projects'].includes(w.toLowerCase()),
  })
  return { table, masker }
}

const roundTrip = (masker: Masker, s: string) => {
  const out = masker.maskText(s)
  expect(masker.maskText(out)).toBe(out)
  expect(masker.unmaskText(out)).toBe(s)
  return out
}

describe('vCloak hidden names in other spellings and places', () => {
  it('hides lowercase, UPPERCASE and Capitalised spellings, each restored exactly', () => {
    const { masker } = make()
    const s = 'zorbleton Zorbleton ZORBLETON acmeapps/security/x.md ACMEAPPS megatool'
    const out = roundTrip(masker, s)
    expect(out.toLowerCase()).not.toMatch(/zorbleton|acmeapps|megatool/)
    const [lower, capd, upper] = out.split(' ')
    expect(capd).toBe(lower[0].toUpperCase() + lower.slice(1))
    expect(upper).toBe(lower.toUpperCase())
  })

  it('hides names inside underscore_joined names and before a file type', () => {
    const { masker } = make()
    const s = 'see project_zorbleton_notes.md and Zorbleton_incident.md and zorbleton.yaml'
    const out = roundTrip(masker, s)
    expect(out.toLowerCase()).not.toContain('zorbleton')
  })

  it('uses one alias for a workspace folder alone and in paths', () => {
    const { masker } = make()
    const path = roundTrip(masker, `ls ${WS}/legacy-repos/billing-api`)
    const pathAlias = path.split('/')[5]
    expect(pathAlias).not.toBe('legacy-repos')
    expect(masker.maskText('legacy-repos')).toBe(pathAlias)
    expect(masker.unmaskText(`git -C ${pathAlias} status`)).toBe('git -C legacy-repos status')
  })

  it('hides names inside dash-encoded folder names outside the hidden folder', () => {
    const { masker } = make()
    const s = 'memory at ~/.claude/projects/-Users-you-Documents-MegaTool/memory and -Users-you-old-zorbleton-web'
    const out = roundTrip(masker, s)
    expect(out).not.toMatch(/MegaTool|zorbleton|-you-/)
  })

  it('restores an alias the model wrote in another case than it was shown', () => {
    const { masker } = make()
    const alias = masker.maskText('zorbleton')
    const capd = alias[0].toUpperCase() + alias.slice(1)
    const reply = `${capd} and ${alias.toUpperCase()} and ${capd}_notes.md`
    expect(masker.unmaskText(reply)).toBe('Zorbleton and ZORBLETON and Zorbleton_notes.md')
    expect(masker.maskText('Zorbleton and ZORBLETON')).toBe(`${capd} and ${alias.toUpperCase()}`)
  })

  it('leaves ordinary words and their spellings alone', () => {
    const { masker } = make()
    const s = 'Core and CORE and core_notes.md and Billing'
    expect(masker.maskText(s)).toBe(s)
  })
})
