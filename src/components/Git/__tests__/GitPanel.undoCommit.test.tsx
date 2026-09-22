import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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

beforeEach(() => {
  ;(global as any).window.api = {
    gitStatus: vi.fn().mockResolvedValue(emptyStatus),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue({ ahead: 1, behind: 0 }),
    gitRunCommand: vi.fn().mockResolvedValue(undefined),
    onGitLogData: vi.fn().mockReturnValue(() => {}),
    onGitLogExit: vi.fn().mockReturnValue(() => {}),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  seed({ ahead: 1, behind: 0 })
})

afterEach(cleanup)

// Lives behind the "Git Functions" dropdown, alongside Reset/Hard Reset —
// see GitPanel.gitReset.test.tsx for those. The dropdown item's accessible
// name includes its subtitle line, so it's targeted by text like the other
// two-line items rather than by exact role name.
function openUndoLastCommit() {
  fireEvent.click(screen.getByRole('button', { name: 'Git Functions' }))
  fireEvent.click(screen.getByText('Undo Last Commit'))
}

describe('GitPanel — Undo Last Commit', () => {
  it('is reachable from the Git Functions dropdown', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Git Functions' }))
    expect(screen.getByText('Undo Last Commit')).toBeTruthy()
  })

  it('opens a confirm modal rather than resetting immediately', () => {
    render(<GitPanel />)
    openUndoLastCommit()

    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
    expect(screen.getByText(/keeping/)).toBeTruthy()
  })

  it('confirming soft-resets one commit back, locally only', () => {
    render(<GitPanel />)
    openUndoLastCommit()
    fireEvent.click(screen.getByRole('button', { name: 'Undo Commit' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'undoLastCommit')
  })

  it('cancelling runs nothing', () => {
    render(<GitPanel />)
    openUndoLastCommit()
    fireEvent.click(screen.getByText('Cancel'))

    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })

  it('warns when the commit is already on the remote (ahead === 0)', () => {
    seed({ ahead: 0, behind: 0 })
    render(<GitPanel />)
    openUndoLastCommit()

    expect(screen.getByText(/already been pushed to origin/)).toBeTruthy()
  })

  // getAheadBehind() returns null on a branch with no upstream. The item must
  // still work there — that is where a stray local commit is most likely.
  it('still offers the undo on a branch with no upstream', () => {
    seed(null)
    render(<GitPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Git Functions' }))
    const item = screen.getByText('Undo Last Commit').closest('button')!
    expect(item).not.toBeDisabled()
    fireEvent.click(item)
    fireEvent.click(screen.getByRole('button', { name: 'Undo Commit' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'undoLastCommit')
  })
})
