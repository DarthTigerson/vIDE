import type {
  GitCommandAction,
  GitCommandPayload,
  GitCheckoutPayload,
  GitPublishBranchPayload,
  GitHardResetPayload,
  GitRefPayload,
  GitDeleteBranchPayload,
} from '../src/types/index'

type FixedAction = Exclude<
  GitCommandAction,
  'checkout' | 'publishBranch' | 'hardReset' | 'merge' | 'rebase' | 'deleteBranch'
>

const FIXED_ARGS: Record<FixedAction, string[]> = {
  fetch:           ['fetch'],
  pull:            ['pull'],
  push:            ['push'],
  forcePush:       ['push', '--force'],
  forcePushLease:  ['push', '--force-with-lease'],
  undoLastCommit:  ['reset', '--soft', 'HEAD~1'],
  stash:           ['stash', 'push'],
  stashUntracked:  ['stash', 'push', '--include-untracked'],
  stashPop:        ['stash', 'pop'],
  amend:           ['commit', '--amend', '--no-edit'],
  mergeAbort:      ['merge', '--abort'],
  rebaseAbort:     ['rebase', '--abort'],
  rebaseContinue:  ['rebase', '--continue'],
}

// A ref/branch that is empty or starts with "-" would be read by git as an
// option (e.g. `branch -D`), so refuse it rather than pass it through.
function plainRef(value: string): string {
  if (!value || value.startsWith('-')) throw new Error(`Invalid ref: "${value}"`)
  return value
}

export function buildGitArgs(action: GitCommandAction, payload?: GitCommandPayload): string[] {
  if (action === 'checkout') {
    const { ref, create, track } = payload as GitCheckoutPayload
    if (track) return ['checkout', '-b', ref, '--track', track]
    if (create) return ['checkout', '-b', ref]
    return ['checkout', ref]
  }
  if (action === 'publishBranch') {
    const { branch } = payload as GitPublishBranchPayload
    return ['push', '--set-upstream', 'origin', branch]
  }
  if (action === 'hardReset') {
    const { ref } = payload as GitHardResetPayload
    return ['reset', '--hard', ref]
  }
  if (action === 'merge') {
    return ['merge', '--no-edit', plainRef((payload as GitRefPayload).ref)]
  }
  if (action === 'rebase') {
    return ['rebase', plainRef((payload as GitRefPayload).ref)]
  }
  if (action === 'deleteBranch') {
    return ['branch', '-d', plainRef((payload as GitDeleteBranchPayload).branch)]
  }
  return FIXED_ARGS[action]
}

// These are spawned in a PTY nobody can type into. merge (message editor) and
// rebase / rebase --continue (commit-message editor after a conflict) would
// otherwise sit waiting on $EDITOR forever.
const NEEDS_NO_EDITOR: ReadonlySet<GitCommandAction> = new Set(['merge', 'rebase', 'rebaseContinue'])

export function gitEnvFor(action: GitCommandAction): Record<string, string> {
  return NEEDS_NO_EDITOR.has(action) ? { GIT_EDITOR: 'true' } : {}
}
