import { describe, it, expect, beforeEach, vi } from 'vitest'

// Some stores read localStorage at import time, and this suite runs in node.
vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/platform', () => ({ isMac: true }))

import { gitCommands } from '../gitCommands'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitPromptStore } from '@/stores/gitPromptStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import { useSearchStore } from '@/stores/searchStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'

const find = (id: string) => {
  const cmd = gitCommands().find((c) => c.id === id)
  if (!cmd) throw new Error(`missing command ${id}`)
  return cmd
}

function setRepo(patch: Partial<typeof emptyRepoGitState> = {}) {
  useGitStore.setState({ repos: { '/a': { ...emptyRepoGitState, branch: 'main', ...patch } } })
}

beforeEach(() => {
  useGitReposStore.setState({ repos: ['/a'], selectedRepo: '/a' })
  setRepo()
  useGitPromptStore.setState({ prompt: null })
  usePanelRequestStore.setState({ request: null })
  useSearchStore.setState({ branchPaletteOpen: false, repoPaletteOpen: false })
})

describe('shared reasons', () => {
  it('greys every git command with no repo', () => {
    useGitReposStore.setState({ repos: [], selectedRepo: null })
    for (const id of ['git-fetch', 'git-pull', 'git-push', 'git-checkout', 'git-hard-reset']) {
      expect(find(id).disabledReason?.()).toBe('No git repository open')
    }
  })

  it('greys commands while a git command is running', () => {
    setRepo({ commandStatus: 'running' })
    expect(find('git-pull').disabledReason?.()).toBe('A git command is already running')
  })

  it('appends the repo name to descriptions only when several repos are open', () => {
    expect(find('git-fetch').description).not.toContain('·')
    useGitReposStore.setState({ repos: ['/a', '/b'], selectedRepo: '/a' })
    expect(find('git-fetch').description).toContain('· a')
  })
})

describe('sync commands', () => {
  it('Fetch / Pull / Push call the store for the selected repo', () => {
    const fetch = vi.fn(); const pull = vi.fn(); const push = vi.fn()
    useGitStore.setState({ fetch, pull, push })
    find('git-fetch').action?.(); find('git-pull').action?.(); find('git-push').action?.()
    expect(fetch).toHaveBeenCalledWith('/a')
    expect(pull).toHaveBeenCalledWith('/a')
    expect(push).toHaveBeenCalledWith('/a')
  })

  it('Publish Branch passes the current branch, and is greyed without one', () => {
    const publishBranch = vi.fn()
    useGitStore.setState({ publishBranch })
    find('git-publish-branch').action?.()
    expect(publishBranch).toHaveBeenCalledWith('/a', 'main')
    setRepo({ branch: null })
    expect(find('git-publish-branch').disabledReason?.()).toBe('No branch checked out')
  })

  it('Force Push runs directly when safety is off, otherwise opens the existing confirm', () => {
    const forcePush = vi.fn()
    useGitStore.setState({ forcePush })
    useGitSettingsStore.setState({ forceSafetyEnabled: false })
    find('git-force-push').action?.()
    expect(forcePush).toHaveBeenCalledWith('/a')

    useGitSettingsStore.setState({ forceSafetyEnabled: true })
    find('git-force-push-lease').action?.()
    expect(useGitPromptStore.getState().prompt).toEqual({ kind: 'forcePush', action: 'forcePushLease', cwd: '/a' })
    expect(find('git-force-push').danger).toBe(true)
  })
})

describe('commit commands', () => {
  it('are greyed until something is staged and a message exists', () => {
    expect(find('git-commit').disabledReason?.()).toBe('Nothing staged')
    setRepo({ status: { staged: [{ path: 'x', status: 'M' }], unstaged: [] } })
    expect(find('git-commit').disabledReason?.()).toBe('No commit message')
    setRepo({ status: { staged: [{ path: 'x', status: 'M' }], unstaged: [] }, commitMessage: 'msg' })
    expect(find('git-commit').disabledReason?.()).toBeNull()
  })

  it('Commit and Commit (no verify) call the store', () => {
    const commit = vi.fn()
    useGitStore.setState({ commit })
    setRepo({ status: { staged: [{ path: 'x', status: 'M' }], unstaged: [] }, commitMessage: 'msg' })
    find('git-commit').action?.()
    find('git-commit-no-verify').action?.()
    expect(commit).toHaveBeenNthCalledWith(1, '/a')
    expect(commit).toHaveBeenNthCalledWith(2, '/a', true)
  })
})

describe('index commands', () => {
  it('Stage All / Unstage All are greyed when there is nothing to do', () => {
    expect(find('git-stage-all').disabledReason?.()).toBe('Nothing to stage')
    expect(find('git-unstage-all').disabledReason?.()).toBe('Nothing staged')
  })

  it('Stage All / Unstage All call the store', () => {
    const stageAll = vi.fn(); const unstageAll = vi.fn()
    useGitStore.setState({ stageAll, unstageAll })
    setRepo({ status: { staged: [{ path: 'a', status: 'M' }], unstaged: [{ path: 'b', status: 'M' }] } })
    find('git-stage-all').action?.(); find('git-unstage-all').action?.()
    expect(stageAll).toHaveBeenCalledWith('/a')
    expect(unstageAll).toHaveBeenCalledWith('/a')
  })

  it('Discard All is greyed for untracked-only changes and confirms before discarding', () => {
    setRepo({ status: { staged: [], unstaged: [{ path: 'new.txt', status: '?' }] } })
    expect(find('git-discard-all').disabledReason?.()).toBe('No unstaged changes to tracked files')

    const discardAll = vi.fn()
    useGitStore.setState({ discardAll })
    setRepo({ status: { staged: [], unstaged: [{ path: 'a.txt', status: 'M' }] } })
    expect(find('git-discard-all').disabledReason?.()).toBeNull()
    find('git-discard-all').action?.()
    const prompt = useGitPromptStore.getState().prompt
    expect(prompt?.kind).toBe('confirm')
    expect(discardAll).not.toHaveBeenCalled()
    if (prompt?.kind === 'confirm') prompt.onConfirm()
    expect(discardAll).toHaveBeenCalledWith('/a')
    expect(find('git-discard-all').danger).toBe(true)
  })
})

describe('reset and pickers', () => {
  it('Undo Last Commit and Hard Reset open the existing flows', () => {
    find('git-undo-last-commit').action?.()
    expect(useGitPromptStore.getState().prompt).toEqual({ kind: 'undoCommit', cwd: '/a' })
    find('git-hard-reset').action?.()
    expect(useGitPromptStore.getState().prompt).toEqual({ kind: 'hardResetPick', cwd: '/a' })
    expect(find('git-hard-reset').danger).toBe(true)
    expect(find('git-undo-last-commit').danger).toBe(true)
  })

  it('Checkout… opens the existing branch palette', () => {
    find('git-checkout').action?.()
    expect(useSearchStore.getState().branchPaletteOpen).toBe(true)
  })

  it('Switch Repo… is greyed with one repo, otherwise shows the Git panel and repo palette', () => {
    expect(find('git-switch-repo').disabledReason?.()).toBe('Only one repository in this project')
    useGitReposStore.setState({ repos: ['/a', '/b'], selectedRepo: '/a' })
    expect(find('git-switch-repo').disabledReason?.()).toBeNull()
    find('git-switch-repo').action?.()
    expect(usePanelRequestStore.getState().request?.panel).toBe('git')
    expect(useSearchStore.getState().repoPaletteOpen).toBe(true)
  })
})
