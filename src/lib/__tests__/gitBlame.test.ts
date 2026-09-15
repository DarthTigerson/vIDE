import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { GitFileBlame } from '@/types/index'

const gitBlameMock = vi.fn<(cwd: string, path: string) => Promise<GitFileBlame>>()

vi.stubGlobal('window', {
  api: {
    gitBlame: gitBlameMock,
  },
})

import { getFileBlame, invalidateRepoBlame, clearBlameCache } from '../gitBlame'

function blameResult(headCommit: string): GitFileBlame {
  return {
    headCommit,
    lines: [{ line: 1, hash: headCommit, author: 'Test', authorTime: 1700000000, summary: 'test commit' }],
  }
}

describe('getFileBlame (renderer cache)', () => {
  beforeEach(() => {
    gitBlameMock.mockReset()
    clearBlameCache()
  })

  it('fetches over IPC on first call for a (repo, file) pair', async () => {
    gitBlameMock.mockResolvedValue(blameResult('abc123'))

    const result = await getFileBlame('/repo', 'a.ts')

    expect(gitBlameMock).toHaveBeenCalledTimes(1)
    expect(gitBlameMock).toHaveBeenCalledWith('/repo', 'a.ts')
    expect(result.headCommit).toBe('abc123')
  })

  it('serves a cached result on a second call without re-fetching', async () => {
    gitBlameMock.mockResolvedValue(blameResult('abc123'))

    await getFileBlame('/repo', 'a.ts')
    await getFileBlame('/repo', 'a.ts')

    expect(gitBlameMock).toHaveBeenCalledTimes(1)
  })

  it('treats different repos or paths as separate cache entries', async () => {
    gitBlameMock.mockResolvedValue(blameResult('abc123'))

    await getFileBlame('/repo', 'a.ts')
    await getFileBlame('/repo', 'b.ts')
    await getFileBlame('/other-repo', 'a.ts')

    expect(gitBlameMock).toHaveBeenCalledTimes(3)
  })

  it('dedupes concurrent in-flight requests for the same (repo, file)', async () => {
    let resolve!: (value: GitFileBlame) => void
    gitBlameMock.mockReturnValue(new Promise((r) => { resolve = r }))

    const first = getFileBlame('/repo', 'a.ts')
    const second = getFileBlame('/repo', 'a.ts')
    resolve(blameResult('abc123'))

    await Promise.all([first, second])
    expect(gitBlameMock).toHaveBeenCalledTimes(1)
  })

  it('re-fetches when force is passed, even with a cached entry', async () => {
    gitBlameMock.mockResolvedValueOnce(blameResult('abc123'))
    gitBlameMock.mockResolvedValueOnce(blameResult('def456'))

    await getFileBlame('/repo', 'a.ts')
    const second = await getFileBlame('/repo', 'a.ts', { force: true })

    expect(gitBlameMock).toHaveBeenCalledTimes(2)
    expect(second.headCommit).toBe('def456')
  })

  it('re-fetches after invalidateRepoBlame clears that repo', async () => {
    gitBlameMock.mockResolvedValue(blameResult('abc123'))

    await getFileBlame('/repo', 'a.ts')
    invalidateRepoBlame('/repo')
    await getFileBlame('/repo', 'a.ts')

    expect(gitBlameMock).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate a different repo\'s cached entries', async () => {
    gitBlameMock.mockResolvedValue(blameResult('abc123'))

    await getFileBlame('/repo', 'a.ts')
    invalidateRepoBlame('/some-other-repo')
    await getFileBlame('/repo', 'a.ts')

    expect(gitBlameMock).toHaveBeenCalledTimes(1)
  })
})
