import { describe, it, expect } from 'vitest'
import { normaliseRepoInput, normaliseRoot } from '../normalise'

const KNOWN = [{
  root: '/Users/sam/work/acme',
  repos: [
    { rel: 'platform/billing/api', remote: 'acme-corp/platform/billing/api' },
    { rel: 'deploy-config', remote: 'acme-corp/infra/deploy-config' },
  ],
}]
const gl = (path: string) => ({ path, host: 'gitlab' as const })
const n = (input: string, root = 'acme-corp') => normaliseRepoInput(input, [gl(root)], KNOWN, '/Users/sam')

describe('normaliseRepoInput', () => {
  it.each([
    ['https://gitlab.com/acme-corp/group/sub/repo', 'acme-corp/group/sub/repo'],
    ['https://gitlab.com/acme-corp/group/sub/repo.git', 'acme-corp/group/sub/repo'],
    ['http://git.example.org/acme-corp/group/repo/-/merge_requests/4', 'acme-corp/group/repo'],
    ['https://gitlab.com/acme-corp/group/repo.git/-/tree/main', 'acme-corp/group/repo'],
    ['https://gitlab.com/acme-corp/group/repo/', 'acme-corp/group/repo'],
    ['git@gitlab.com:acme-corp/group/sub/repo.git', 'acme-corp/group/sub/repo'],
    ['ssh://git@gitlab.com/acme-corp/group/repo.git', 'acme-corp/group/repo'],
    ['ssh://git@gitlab.com:22/acme-corp/group/repo.git', 'acme-corp/group/repo'],
    ['acme-corp%2Fgroup%2Frepo', 'acme-corp/group/repo'],
    ['  /acme-corp/group/repo/ ', 'acme-corp/group/repo'],
  ])('%s', (input, want) => {
    expect(n(input)).toEqual({ ok: true, value: want })
  })

  it('adds the root when missing', () => {
    expect(n('core-services/nexus')).toEqual({ ok: true, value: 'acme-corp/core-services/nexus' })
    expect(n('acme-corp/core-services/nexus')).toEqual({ ok: true, value: 'acme-corp/core-services/nexus' })
    expect(n('core-services/nexus', '')).toEqual({ ok: true, value: 'core-services/nexus' })
  })

  it('maps local folders in a scanned workspace to the repo group path', () => {
    expect(n('/Users/sam/work/acme/platform/billing/api')).toEqual({ ok: true, value: 'acme-corp/platform/billing/api' })
    expect(n('/Users/sam/work/acme/platform/billing/api/src/x')).toEqual({ ok: true, value: 'acme-corp/platform/billing/api/src/x' })
    expect(n('~/work/acme/deploy-config/')).toEqual({ ok: true, value: 'acme-corp/infra/deploy-config' })
  })

  it('explains when a folder is not a known repository', () => {
    expect(n('/Users/sam/elsewhere/thing')).toEqual({ ok: false, error: 'No git repository found at /Users/sam/elsewhere/thing. To hide a local folder, add it under Hidden local folders.' })
    expect(n('/Users/sam/work/acme/unknown')).toMatchObject({ ok: false })
  })

  it('keeps blank input blank', () => {
    expect(n('   ')).toEqual({ ok: true, value: '' })
  })
})

describe('normaliseRoot', () => {
  it('turns links into group paths', () => {
    expect(normaliseRoot('https://gitlab.com/acme-corp')).toBe('acme-corp')
    expect(normaliseRoot('https://gitlab.com/acme-corp/sub')).toBe('acme-corp/sub')
    expect(normaliseRoot('https://gitlab.com/acme-corp/sub/')).toBe('acme-corp/sub')
    expect(normaliseRoot('https://gitlab.com/groups/acme-corp/-/issues')).toBe('groups/acme-corp')
    expect(normaliseRoot(' /acme-corp/ ')).toBe('acme-corp')
    expect(normaliseRoot('acme-corp')).toBe('acme-corp')
    expect(normaliseRoot('')).toBe('')
  })
})
