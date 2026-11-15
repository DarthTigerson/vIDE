import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGitRemoteUrlStore, gitRemoteBrowserId } from '../gitRemoteUrlStore'

const gitRemoteWebUrl = vi.fn()

beforeEach(() => {
  gitRemoteWebUrl.mockReset()
  ;(globalThis as any).window = { api: { gitRemoteWebUrl } }
  useGitRemoteUrlStore.setState({ urls: {} })
})

describe('gitRemoteUrlStore', () => {
  it('caches each repo\'s web URL separately', async () => {
    gitRemoteWebUrl.mockImplementation(async (repo: string) => (repo === '/p/a' ? 'https://github.com/acme/a' : 'https://gitlab.com/acme/b'))
    await useGitRemoteUrlStore.getState().refresh('/p/a')
    await useGitRemoteUrlStore.getState().refresh('/p/b')
    expect(useGitRemoteUrlStore.getState().urls).toEqual({
      '/p/a': 'https://github.com/acme/a',
      '/p/b': 'https://gitlab.com/acme/b',
    })
  })

  it('records null for a repo without a remote, or when the lookup fails', async () => {
    gitRemoteWebUrl.mockResolvedValueOnce(null)
    expect(await useGitRemoteUrlStore.getState().refresh('/p/a')).toBeNull()
    gitRemoteWebUrl.mockRejectedValueOnce(new Error('boom'))
    expect(await useGitRemoteUrlStore.getState().refresh('/p/b')).toBeNull()
    expect(useGitRemoteUrlStore.getState().urls).toEqual({ '/p/a': null, '/p/b': null })
  })
})

describe('gitRemoteBrowserId', () => {
  it('is stable per repo, distinct across repos, and has no path separators', () => {
    expect(gitRemoteBrowserId('/p/a')).toBe(gitRemoteBrowserId('/p/a'))
    expect(gitRemoteBrowserId('/p/a')).not.toBe(gitRemoteBrowserId('/p/b'))
    expect(gitRemoteBrowserId('/p/a')).toMatch(/^git-remote-[0-9a-z]+$/)
  })
})
