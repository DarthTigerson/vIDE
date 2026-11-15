import { describe, it, expect } from 'vitest'
import { remoteToWebUrl, pickRemoteName } from '../gitRemoteUrl'

describe('remoteToWebUrl', () => {
  it('strips .git from https remotes', () => {
    expect(remoteToWebUrl('https://github.com/acme/widgets.git')).toBe('https://github.com/acme/widgets')
    expect(remoteToWebUrl('https://github.com/acme/widgets')).toBe('https://github.com/acme/widgets')
  })

  it('drops credentials embedded in https remotes', () => {
    expect(remoteToWebUrl('https://user:ghp_secret@github.com/acme/widgets.git')).toBe('https://github.com/acme/widgets')
    expect(remoteToWebUrl('https://oauth2:token@gitlab.example.com/group/sub/proj.git')).toBe('https://gitlab.example.com/group/sub/proj')
  })

  it('converts scp-like SSH remotes', () => {
    expect(remoteToWebUrl('git@github.com:acme/widgets.git')).toBe('https://github.com/acme/widgets')
    expect(remoteToWebUrl('git@gitlab.com:group/sub/proj.git')).toBe('https://gitlab.com/group/sub/proj')
    expect(remoteToWebUrl('bitbucket.org:team/repo')).toBe('https://bitbucket.org/team/repo')
  })

  it('converts ssh:// and git:// remotes, dropping the transport port', () => {
    expect(remoteToWebUrl('ssh://git@git.corp.internal:2222/team/repo.git')).toBe('https://git.corp.internal/team/repo')
    expect(remoteToWebUrl('git://example.org/team/repo.git')).toBe('https://example.org/team/repo')
  })

  it('keeps a non-default https port and trims whitespace and trailing slashes', () => {
    expect(remoteToWebUrl('  https://git.corp.internal:8443/team/repo.git/  ')).toBe('https://git.corp.internal:8443/team/repo')
  })

  it('returns null for local and unusable remotes', () => {
    expect(remoteToWebUrl('')).toBeNull()
    expect(remoteToWebUrl('/srv/git/repo.git')).toBeNull()
    expect(remoteToWebUrl('../other-repo')).toBeNull()
    expect(remoteToWebUrl('file:///srv/git/repo.git')).toBeNull()
    expect(remoteToWebUrl('https://github.com/')).toBeNull()
  })
})

describe('pickRemoteName', () => {
  it('prefers the upstream remote, then origin, then the first remote', () => {
    expect(pickRemoteName(['origin', 'fork'], 'fork')).toBe('fork')
    expect(pickRemoteName(['fork', 'origin'], null)).toBe('origin')
    expect(pickRemoteName(['upstream', 'fork'], null)).toBe('upstream')
    expect(pickRemoteName(['origin'], 'gone')).toBe('origin')
    expect(pickRemoteName([], null)).toBeNull()
  })
})
