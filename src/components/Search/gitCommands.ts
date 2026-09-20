import type { Command, PaletteStep } from './commands'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import type { RepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitBranchStore, emptyRepoBranchState } from '@/stores/gitBranchStore'
import { useSearchStore } from '@/stores/searchStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useGitPromptStore, requestForcePush } from '@/stores/gitPromptStore'

const NO_REPO = 'No git repository open'
const BUSY = 'A git command is already running'

function targetRepo(): string | null {
  return useGitReposStore.getState().selectedRepo
}

function repoState(cwd: string): RepoGitState {
  return useGitStore.getState().repos[cwd] ?? emptyRepoGitState
}

// Shown on git commands only when the project has several repos, so it is
// clear which one a command will act on.
function repoSuffix(): string {
  const { repos, selectedRepo } = useGitReposStore.getState()
  return repos.length > 1 && selectedRepo ? ` · ${selectedRepo.split('/').pop()}` : ''
}

// Reason shared by everything that runs a git command against the target repo.
function baseReason(): string | null {
  const cwd = targetRepo()
  if (!cwd) return NO_REPO
  return repoState(cwd).commandStatus === 'running' ? BUSY : null
}

function withRepo(run: (cwd: string) => void): () => void {
  return () => {
    const cwd = targetRepo()
    if (cwd) run(cwd)
  }
}

function stateReason(check: (state: RepoGitState) => string | null): () => string | null {
  return () => {
    const base = baseReason()
    if (base) return base
    return check(repoState(targetRepo() as string))
  }
}

// Builds the branch list for a two-step command. Loads fresh branch data
// first (same call BranchPalette makes on open). The current branch is never
// offered — you can't merge, rebase onto or delete the branch you're on.
async function branchStep(options: {
  placeholder: string
  includeRemote: boolean
  onPick: (cwd: string, ref: string) => void
}): Promise<PaletteStep> {
  const cwd = targetRepo()
  if (!cwd) throw new Error(NO_REPO)
  await useGitBranchStore.getState().load(cwd)
  const { current, local, remote } = useGitBranchStore.getState().repos[cwd] ?? emptyRepoBranchState
  const refs = [
    ...local.filter((branch) => branch !== current),
    // Bare "origin" and origin/HEAD are symbolic refs, not branches.
    ...(options.includeRemote ? remote.filter((ref) => ref.includes('/') && !ref.endsWith('/HEAD')) : []),
  ]
  return {
    placeholder: options.placeholder,
    emptyText: 'No other branches',
    items: refs.map((ref) => ({ id: ref, label: ref })),
    onPick: (ref) => options.onPick(cwd, ref),
  }
}

const DISCARD_MESSAGE =
  'Discard all unstaged changes to tracked files? Staged changes and untracked files are ' +
  'left alone. This cannot be undone.'

export function gitCommands(): Command[] {
  const suffix = repoSuffix()
  const desc = (text: string) => `${text}${suffix}`
  const hasStaged = (s: RepoGitState) => s.status.staged.length > 0
  const commitReason = stateReason((s) => {
    if (!hasStaged(s)) return 'Nothing staged'
    return s.commitMessage.trim() ? null : 'No commit message'
  })

  return [
    {
      id: 'git-fetch', label: 'Git: Fetch', description: desc('Fetch from the remote'),
      keywords: ['remote', 'origin'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().fetch(cwd)),
    },
    {
      id: 'git-pull', label: 'Git: Pull', description: desc('Pull the current branch'),
      keywords: ['remote', 'update', 'sync'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().pull(cwd)),
    },
    {
      id: 'git-push', label: 'Git: Push', description: desc('Push the current branch'),
      keywords: ['remote', 'upload', 'sync'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().push(cwd)),
    },
    {
      id: 'git-publish-branch', label: 'Git: Publish Branch',
      description: desc('Push and set the upstream for the current branch'),
      keywords: ['upstream', 'remote', 'push'],
      disabledReason: stateReason((s) => (s.branch ? null : 'No branch checked out')),
      action: withRepo((cwd) => {
        const branch = repoState(cwd).branch
        if (branch) void useGitStore.getState().publishBranch(cwd, branch)
      }),
    },
    {
      id: 'git-force-push', label: 'Git: Force Push', description: desc('Overwrite the remote branch'),
      keywords: ['overwrite', 'remote'], danger: true,
      disabledReason: baseReason,
      action: withRepo((cwd) => requestForcePush('forcePush', cwd)),
    },
    {
      id: 'git-force-push-lease', label: 'Git: Force Push (with lease)',
      description: desc('Overwrite the remote branch unless it changed'),
      keywords: ['overwrite', 'remote', 'safe'], danger: true,
      disabledReason: baseReason,
      action: withRepo((cwd) => requestForcePush('forcePushLease', cwd)),
    },
    {
      id: 'git-commit', label: 'Git: Commit', description: desc('Commit the staged changes with the message in the Git panel'),
      keywords: ['save'],
      disabledReason: commitReason,
      action: withRepo((cwd) => void useGitStore.getState().commit(cwd)),
    },
    {
      id: 'git-commit-no-verify', label: 'Git: Commit (no verify)',
      description: desc('Commit while skipping git hooks'),
      keywords: ['hooks', 'skip'],
      disabledReason: commitReason,
      action: withRepo((cwd) => void useGitStore.getState().commit(cwd, true)),
    },
    {
      id: 'git-undo-last-commit', label: 'Git: Undo Last Commit',
      description: desc('Undo the last commit, keeping its changes staged'),
      keywords: ['reset', 'soft'], danger: true,
      disabledReason: baseReason,
      action: withRepo((cwd) => useGitPromptStore.getState().open({ kind: 'undoCommit', cwd })),
    },
    {
      id: 'git-stage-all', label: 'Git: Stage All', description: desc('Stage every change'),
      keywords: ['add', 'index'],
      disabledReason: stateReason((s) => (s.status.unstaged.length > 0 ? null : 'Nothing to stage')),
      action: withRepo((cwd) => void useGitStore.getState().stageAll(cwd)),
    },
    {
      id: 'git-unstage-all', label: 'Git: Unstage All', description: desc('Unstage everything'),
      keywords: ['reset', 'index'],
      disabledReason: stateReason((s) => (hasStaged(s) ? null : 'Nothing staged')),
      action: withRepo((cwd) => void useGitStore.getState().unstageAll(cwd)),
    },
    {
      id: 'git-discard-all', label: 'Git: Discard All Changes',
      description: desc('Throw away unstaged changes to tracked files'),
      keywords: ['revert', 'checkout', 'clean'], danger: true,
      disabledReason: stateReason((s) =>
        s.status.unstaged.some((file) => file.status !== '?') ? null : 'No unstaged changes to tracked files'),
      action: withRepo((cwd) =>
        useGitPromptStore.getState().open({
          kind: 'confirm',
          cwd,
          title: 'Discard All Changes',
          message: DISCARD_MESSAGE,
          confirmLabel: 'Discard All',
          onConfirm: () => void useGitStore.getState().discardAll(cwd),
        })),
    },
    {
      id: 'git-hard-reset', label: 'Git: Hard Reset…', description: desc('Reset to a branch, tag or commit'),
      keywords: ['reset', 'rewind'], danger: true,
      disabledReason: baseReason,
      action: withRepo((cwd) => useGitPromptStore.getState().open({ kind: 'hardResetPick', cwd })),
    },
    {
      id: 'git-checkout', label: 'Git: Checkout…', description: 'Switch or create a branch',
      keywords: ['branch', 'switch', 'change'],
      disabledReason: () => (targetRepo() ? null : NO_REPO),
      action: () => useSearchStore.getState().openBranchPalette(),
    },
    {
      id: 'git-switch-repo', label: 'Git: Switch Repo…', description: 'Choose which repository git commands act on',
      keywords: ['repository', 'change'],
      disabledReason: () =>
        useGitReposStore.getState().repos.length > 1 ? null : 'Only one repository in this project',
      action: () => {
        // The repo palette is rendered inside GitPanel, so the panel has to be showing.
        usePanelRequestStore.getState().requestPanel('git')
        useSearchStore.getState().openRepoPalette()
      },
    },
    {
      id: 'git-stash', label: 'Git: Stash', description: desc('Stash tracked changes'),
      keywords: ['shelve', 'save', 'wip'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().stash(cwd)),
    },
    {
      id: 'git-stash-untracked', label: 'Git: Stash (include untracked)',
      description: desc('Stash tracked and untracked files'),
      keywords: ['shelve', 'save', 'wip', 'new files'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().stashUntracked(cwd)),
    },
    {
      id: 'git-stash-pop', label: 'Git: Stash Pop', description: desc('Apply and drop the latest stash'),
      keywords: ['unstash', 'restore', 'apply'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().stashPop(cwd)),
    },
    {
      id: 'git-amend', label: 'Git: Amend Last Commit',
      description: desc('Add staged changes to the last commit, keeping its message'),
      keywords: ['fixup', 'commit'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().amend(cwd)),
    },
    {
      id: 'git-merge-abort', label: 'Git: Merge Abort', description: desc('Abort an in-progress merge'),
      keywords: ['cancel', 'conflict'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().mergeAbort(cwd)),
    },
    {
      id: 'git-rebase-abort', label: 'Git: Rebase Abort', description: desc('Abort an in-progress rebase'),
      keywords: ['cancel', 'conflict'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().rebaseAbort(cwd)),
    },
    {
      id: 'git-rebase-continue', label: 'Git: Rebase Continue',
      description: desc('Continue a rebase after resolving conflicts'),
      keywords: ['resume', 'conflict'],
      disabledReason: baseReason,
      action: withRepo((cwd) => void useGitStore.getState().rebaseContinue(cwd)),
    },
    {
      id: 'git-merge', label: 'Git: Merge…', description: desc('Merge a branch into the current one'),
      keywords: ['combine', 'branch'],
      disabledReason: baseReason,
      pick: () =>
        branchStep({
          placeholder: 'Merge which branch into the current one?',
          includeRemote: true,
          onPick: (cwd, ref) => void useGitStore.getState().merge(cwd, ref),
        }),
    },
    {
      id: 'git-rebase', label: 'Git: Rebase Onto…', description: desc('Rebase the current branch onto another'),
      keywords: ['replay', 'branch', 'history'], danger: true,
      disabledReason: baseReason,
      pick: () =>
        branchStep({
          placeholder: 'Rebase the current branch onto…',
          includeRemote: true,
          onPick: (cwd, ref) =>
            useGitPromptStore.getState().open({
              kind: 'confirm',
              cwd,
              title: 'Rebase',
              message: `Rebase the current branch onto ${ref}? This rewrites the current branch's commit history.`,
              confirmLabel: 'Rebase',
              onConfirm: () => void useGitStore.getState().rebase(cwd, ref),
            }),
        }),
    },
    {
      id: 'git-delete-branch', label: 'Git: Delete Branch…', description: desc('Delete a local branch'),
      keywords: ['remove', 'branch'], danger: true,
      disabledReason: baseReason,
      pick: () =>
        branchStep({
          placeholder: 'Delete which local branch?',
          includeRemote: false,
          onPick: (cwd, branch) =>
            useGitPromptStore.getState().open({
              kind: 'confirm',
              cwd,
              title: 'Delete Branch',
              message: `Delete the local branch ${branch}? Git refuses if it has commits that aren't merged.`,
              confirmLabel: 'Delete',
              onConfirm: () => void useGitStore.getState().deleteBranch(cwd, branch),
            }),
        }),
    },
  ]
}
