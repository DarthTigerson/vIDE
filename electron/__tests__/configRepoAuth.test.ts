import { describe, it, expect } from 'vitest'
import { buildAuthUrl } from '../configRepoAuth'

describe('buildAuthUrl', () => {
  it('puts the token in the password slot under the oauth2 username (GitLab)', () => {
    const url = new URL(buildAuthUrl('https://gitlab.com/me/vide-sync.git', 'glpat-abc123'))
    expect(url.username).toBe('oauth2')
    expect(url.password).toBe('glpat-abc123')
    expect(url.host).toBe('gitlab.com')
    expect(url.pathname).toBe('/me/vide-sync.git')
  })

  it('uses the same form for GitHub, which accepts any username with a token password', () => {
    expect(buildAuthUrl('https://github.com/me/vide-sync.git', 'ghp_abc123'))
      .toBe('https://oauth2:ghp_abc123@github.com/me/vide-sync.git')
  })

  it('replaces credentials already embedded in the repo URL', () => {
    expect(buildAuthUrl('https://old:secret@gitlab.example.com/grp/sub/repo.git', 'glpat-new'))
      .toBe('https://oauth2:glpat-new@gitlab.example.com/grp/sub/repo.git')
  })

  it('percent-encodes token characters that would break the URL', () => {
    const url = new URL(buildAuthUrl('https://gitlab.com/me/repo.git', 'a@b:c/d'))
    expect(decodeURIComponent(url.password)).toBe('a@b:c/d')
    expect(url.host).toBe('gitlab.com')
  })

  it('throws on a malformed repo URL', () => {
    expect(() => buildAuthUrl('not a url', 'tok')).toThrow()
  })
})
