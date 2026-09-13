import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../git', () => ({
  getGitBranch: vi.fn(async (cwd: string) => `branch-for-${cwd}`),
  commit: vi.fn(async (cwd: string, message: string, noVerify?: boolean) => ({
    ok: true,
    cwd,
    message,
    noVerify,
  })),
  discoverRepos: vi.fn(async (root: string, maxDepth?: number) => [`${root}:${maxDepth}`]),
  getGitGraph: vi.fn(async (cwd: string, offset?: number, limit?: number) => [`${cwd}:${offset}:${limit}`]),
}))

import { registerGitRelayChannels } from '../channels/gitChannels'

describe('gitChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerGitRelayChannels()
  })

  it('maps git:branch to getGitBranch', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'git:branch', args: ['/repo'] })
    expect(res).toEqual({ type: 'response', id: '1', result: 'branch-for-/repo' })
  })

  it('passes commit args through in order, including optional noVerify', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'git:commit',
      args: ['/repo', 'my message', true],
    })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: { ok: true, cwd: '/repo', message: 'my message', noVerify: true },
    })
  })

  it('passes discoverRepos args through in order, including optional maxDepth', async () => {
    const res = await dispatch({ type: 'invoke', id: '3', method: 'git:discoverRepos', args: ['/root', 2] })
    expect(res).toEqual({ type: 'response', id: '3', result: ['/root:2'] })
  })

  it('passes git:graph offset/limit through in order', async () => {
    const res = await dispatch({ type: 'invoke', id: '4', method: 'git:graph', args: ['/repo', 10, 50] })
    expect(res).toEqual({ type: 'response', id: '4', result: ['/repo:10:50'] })
  })
})
