import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import type { GitStatus } from '@/types/index'

const emptyStatus: GitStatus = { staged: [], unstaged: [] }

function seed(aheadBehind: { ahead: number; behind: number } | null, branch: string | null = 'main') {
  useGitStore.setState({
    repos: { '/proj': { ...emptyRepoGitState, status: emptyStatus, branch, aheadBehind } },
  })
}

// The Push pill itself, not the chevron segment beside it.
function pushPill(): HTMLElement {
  return screen.getByLabelText('Push options').parentElement!
}

function publishPill(): HTMLElement {
  return screen.getByLabelText('Publish options').parentElement!
}

beforeEach(() => {
  ;(global as any).window.api = {
    gitStatus: vi.fn().mockResolvedValue(emptyStatus),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitRunCommand: vi.fn().mockResolvedValue(undefined),
    onGitLogData: vi.fn().mockReturnValue(() => {}),
    onGitLogExit: vi.fn().mockReturnValue(() => {}),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  seed(null)
})

afterEach(cleanup)

describe('GitPanel — unpushed commit indicator on Push', () => {
  it('stays on the accent fill with no badge when everything is pushed', () => {
    seed({ ahead: 0, behind: 0 })
    render(<GitPanel />)
    expect(pushPill().className).toContain('bg-accent/80')
    expect(pushPill().className).not.toContain('amber')
    expect(screen.queryByLabelText(/commits? to push/)).toBeNull()
  })

  it('turns amber and shows the count once commits are waiting', () => {
    seed({ ahead: 3, behind: 0 })
    render(<GitPanel />)
    expect(pushPill().className).toContain('bg-amber-500/80')
    expect(pushPill().className).not.toContain('bg-accent/80')
    expect(screen.getByLabelText('3 commits to push')).toHaveTextContent('3')
  })

  it('says "commit", singular, for exactly one', () => {
    seed({ ahead: 1, behind: 0 })
    render(<GitPanel />)
    expect(screen.getByLabelText('1 commit to push')).toHaveTextContent('1')
  })

  // getAheadBehind() returns null for a branch with no upstream — there is no
  // count to show, and Publish Branch rather than Push is the real action.
  it('does not nag a branch that has no upstream at all', () => {
    seed(null)
    render(<GitPanel />)
    expect(publishPill().className).toContain('bg-accent/80')
    expect(screen.queryByLabelText(/commits? to push/)).toBeNull()
  })

  it('ignores commits the branch is only behind by', () => {
    seed({ ahead: 0, behind: 5 })
    render(<GitPanel />)
    expect(pushPill().className).not.toContain('amber')
  })
})

describe('GitPanel — Publish as the default for an unpublished branch', () => {
  it('labels the primary button Publish when the branch has no upstream', () => {
    seed(null)
    render(<GitPanel />)
    expect(screen.getByText('Publish')).toBeTruthy()
    expect(screen.queryByLabelText('Push options')).toBeNull()
  })

  it('one click publishes the current branch with --set-upstream', () => {
    seed(null)
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Publish'))
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'publishBranch', { branch: 'main' }
    )
  })

  it('drops the now-redundant Publish Branch row from the options menu', () => {
    seed(null)
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Publish options'))
    expect(screen.queryByText('Publish Branch')).toBeNull()
    expect(screen.getByText('Force Push')).toBeTruthy()
  })

  it('stays Push once the branch has an upstream', () => {
    seed({ ahead: 0, behind: 0 })
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Push'))
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'push')
  })

  it('stays Push on a detached HEAD, where there is no branch to publish', () => {
    seed(null, null)
    render(<GitPanel />)
    expect(screen.getByLabelText('Push options')).toBeTruthy()
  })
})
