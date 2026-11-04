import { describe, it, expect, beforeEach, vi } from 'vitest'
import { owningRepos, refreshRepoStatuses } from '../refreshRepoStatuses'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore } from '@/stores/gitStore'

describe('refreshRepoStatuses', () => {
  const refreshStatus = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    refreshStatus.mockClear()
    useGitStore.setState({ refreshStatus } as any)
  })

  it('refreshes every discovered repo, not just the project root', async () => {
    useGitReposStore.setState({ repos: ['/proj/a', '/proj/b'], selectedRepo: '/proj/a' })
    await refreshRepoStatuses('/proj')
    expect(refreshStatus.mock.calls.map((c) => c[0]).sort()).toEqual(['/proj/a', '/proj/b'])
  })

  it('falls back to the project root when no repos were discovered', async () => {
    useGitReposStore.setState({ repos: [], selectedRepo: null })
    await refreshRepoStatuses('/proj')
    expect(refreshStatus).toHaveBeenCalledWith('/proj')
  })

  it('refreshes only the repos that own the changed paths', async () => {
    useGitReposStore.setState({ repos: ['/proj/a', '/proj/b'], selectedRepo: '/proj/a' })
    await refreshRepoStatuses('/proj', ['/proj/b/src/x.ts'])
    expect(refreshStatus.mock.calls.map((c) => c[0])).toEqual(['/proj/b'])
  })
})

describe('owningRepos', () => {
  it('picks the innermost repo and ignores paths outside every repo', () => {
    const repos = ['/proj', '/proj/vendor/lib', '/proj-other']
    expect(owningRepos(repos, ['/proj/vendor/lib/a.ts', '/proj/b.ts', '/elsewhere/c.ts']).sort())
      .toEqual(['/proj', '/proj/vendor/lib'])
  })

  it('does not treat a sibling with a shared prefix as the owner', () => {
    expect(owningRepos(['/proj/a'], ['/proj/ab/x.ts'])).toEqual([])
  })
})
