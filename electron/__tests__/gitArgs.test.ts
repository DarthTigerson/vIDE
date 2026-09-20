import { describe, it, expect } from 'vitest'
import { buildGitArgs, gitEnvFor } from '../gitArgs'

describe('buildGitArgs (existing actions are unchanged)', () => {
  it.each([
    ['fetch', undefined, ['fetch']],
    ['pull', undefined, ['pull']],
    ['push', undefined, ['push']],
    ['forcePush', undefined, ['push', '--force']],
    ['forcePushLease', undefined, ['push', '--force-with-lease']],
    ['undoLastCommit', undefined, ['reset', '--soft', 'HEAD~1']],
    ['checkout', { ref: 'dev', create: false }, ['checkout', 'dev']],
    ['checkout', { ref: 'dev', create: true }, ['checkout', '-b', 'dev']],
    ['checkout', { ref: 'dev', create: true, track: 'origin/dev' }, ['checkout', '-b', 'dev', '--track', 'origin/dev']],
    ['publishBranch', { branch: 'dev' }, ['push', '--set-upstream', 'origin', 'dev']],
    ['hardReset', { ref: 'HEAD' }, ['reset', '--hard', 'HEAD']],
  ] as const)('%s', (action, payload, expected) => {
    expect(buildGitArgs(action, payload as never)).toEqual(expected)
  })
})

describe('buildGitArgs (new actions)', () => {
  it.each([
    ['stash', ['stash', 'push']],
    ['stashUntracked', ['stash', 'push', '--include-untracked']],
    ['stashPop', ['stash', 'pop']],
    ['amend', ['commit', '--amend', '--no-edit']],
    ['mergeAbort', ['merge', '--abort']],
    ['rebaseAbort', ['rebase', '--abort']],
    ['rebaseContinue', ['rebase', '--continue']],
  ] as const)('%s', (action, expected) => {
    expect(buildGitArgs(action)).toEqual(expected)
  })

  it('merge never opens an editor', () => {
    expect(buildGitArgs('merge', { ref: 'feature' })).toEqual(['merge', '--no-edit', 'feature'])
  })

  it('rebase takes the target ref', () => {
    expect(buildGitArgs('rebase', { ref: 'origin/main' })).toEqual(['rebase', 'origin/main'])
  })

  it('deleteBranch uses the safe -d flag only', () => {
    expect(buildGitArgs('deleteBranch', { branch: 'old' })).toEqual(['branch', '-d', 'old'])
  })

  it.each(['-D', '--force', ''])('rejects the ref/branch %j', (bad) => {
    expect(() => buildGitArgs('merge', { ref: bad })).toThrow()
    expect(() => buildGitArgs('rebase', { ref: bad })).toThrow()
    expect(() => buildGitArgs('deleteBranch', { branch: bad })).toThrow()
  })
})

describe('gitEnvFor', () => {
  it('stops git waiting on an editor for merge, rebase and rebase --continue', () => {
    for (const action of ['merge', 'rebase', 'rebaseContinue'] as const) {
      expect(gitEnvFor(action)).toEqual({ GIT_EDITOR: 'true' })
    }
  })

  it('adds nothing for other actions', () => {
    expect(gitEnvFor('pull')).toEqual({})
    expect(gitEnvFor('stash')).toEqual({})
  })
})
