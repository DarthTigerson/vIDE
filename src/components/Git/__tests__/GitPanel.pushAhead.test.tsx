import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import type { GitStatus } from '@/types/index'

const emptyStatus: GitStatus = { staged: [], unstaged: [] }

function seed(aheadBehind: { ahead: number; behind: number } | null) {
  useGitStore.setState({
    repos: { '/proj': { ...emptyRepoGitState, status: emptyStatus, branch: 'main', aheadBehind } },
  })
}

// The Push pill itself, not the chevron segment beside it.
function pushPill(): HTMLElement {
  return screen.getByLabelText('Push options').parentElement!
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
    expect(pushPill().className).toContain('bg-accent/80')
    expect(screen.queryByLabelText(/commits? to push/)).toBeNull()
  })

  it('ignores commits the branch is only behind by', () => {
    seed({ ahead: 0, behind: 5 })
    render(<GitPanel />)
    expect(pushPill().className).not.toContain('amber')
  })
})
