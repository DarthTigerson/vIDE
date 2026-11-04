import { describe, it, expect, beforeEach, vi } from 'vitest'
import { refreshRepoStatuses } from '../refreshRepoStatuses'
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
})
