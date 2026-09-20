import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGitStore } from '../gitStore'

const gitRunCommand = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  gitRunCommand.mockClear()
  vi.stubGlobal('window', {
    api: {
      gitRunCommand,
      onGitLogData: vi.fn(() => () => {}),
      onGitLogExit: vi.fn(() => () => {}),
    },
  })
  useGitStore.setState({ repos: {} })
})

describe('new git store actions run through runCommand', () => {
  it.each([
    ['stash', 'stash'],
    ['stashUntracked', 'stashUntracked'],
    ['stashPop', 'stashPop'],
    ['amend', 'amend'],
    ['mergeAbort', 'mergeAbort'],
    ['rebaseAbort', 'rebaseAbort'],
    ['rebaseContinue', 'rebaseContinue'],
  ] as const)('%s', async (method, action) => {
    await useGitStore.getState()[method]('/r')
    expect(gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/r', action)
  })

  it('merge / rebase pass the ref and deleteBranch passes the branch', async () => {
    await useGitStore.getState().merge('/m', 'feature')
    expect(gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/m', 'merge', { ref: 'feature' })
    await useGitStore.getState().rebase('/b', 'origin/main')
    expect(gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/b', 'rebase', { ref: 'origin/main' })
    await useGitStore.getState().deleteBranch('/d', 'old')
    expect(gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/d', 'deleteBranch', { branch: 'old' })
  })
})
