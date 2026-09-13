import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitBranchStore } from '@/stores/gitBranchStore'
import type { GitStatus } from '@/types/index'

const emptyStatus: GitStatus = { staged: [], unstaged: [] }

beforeEach(() => {
  ;(global as any).window.api = {
    gitStatus: vi.fn().mockResolvedValue(emptyStatus),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue({ ahead: 1, behind: 0 }),
    gitRunCommand: vi.fn().mockResolvedValue(undefined),
    onGitLogData: vi.fn().mockReturnValue(() => {}),
    onGitLogExit: vi.fn().mockReturnValue(() => {}),
    gitBranchList: vi.fn().mockResolvedValue({ current: 'main', local: ['main', 'feature-x'], remote: ['origin/hotfix'] }),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({
    repos: { '/proj': { ...emptyRepoGitState, status: emptyStatus, branch: 'main', aheadBehind: { ahead: 1, behind: 0 } } },
  })
  useGitBranchStore.setState({ repos: {} })
})

afterEach(() => {
  cleanup()
})

describe('GitPanel — Git Reset', () => {
  it('the options panel is closed by default', () => {
    render(<GitPanel />)
    expect(screen.queryByText('Hard Reset…')).toBeNull()
  })

  it('clicking the main Git Reset button opens a confirm modal instead of running immediately', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Git Reset'))

    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
    expect(screen.getByText('Undo Commit')).toBeTruthy()
  })

  it('confirming Undo Last Commit runs the reset with no payload', async () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Git Reset'))
    fireEvent.click(screen.getByText('Undo Commit'))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'undoLastCommit')
  })

  it('warns when the last commit is already pushed (ahead === 0)', () => {
    useGitStore.setState({
      repos: { '/proj': { ...emptyRepoGitState, status: emptyStatus, branch: 'main', aheadBehind: { ahead: 0, behind: 0 } } },
    })
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Git Reset'))

    expect(screen.getByText(/already been pushed to origin/)).toBeTruthy()
  })

  it('cancelling the undo confirm does not run anything', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Git Reset'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Undo Commit')).toBeNull()
    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })

  it('clicking the options chevron opens a panel with Hard Reset…', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Git Reset options'))
    expect(screen.getByText('Hard Reset…')).toBeTruthy()
  })

  it('clicking Hard Reset… opens the ref picker listing branches', async () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Git Reset options'))
    fireEvent.click(screen.getByText('Hard Reset…'))

    expect(await screen.findByText('feature-x')).toBeTruthy()
    expect(screen.getByText('hotfix')).toBeTruthy()
  })

  it('picking a remote branch runs hard reset with the full remote ref', async () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Git Reset options'))
    fireEvent.click(screen.getByText('Hard Reset…'))
    fireEvent.mouseDown(await screen.findByText('hotfix'))
    fireEvent.click(screen.getByRole('button', { name: 'Hard Reset' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'origin/hotfix' }
    )
  })

  it('picking a local branch opens the hard-reset confirm with that ref', async () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Git Reset options'))
    fireEvent.click(screen.getByText('Hard Reset…'))
    fireEvent.mouseDown(await screen.findByText('feature-x'))

    expect(screen.getByRole('button', { name: 'Hard Reset' })).toBeTruthy()
    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })

  it('confirming hard reset runs it with the picked ref', async () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Git Reset options'))
    fireEvent.click(screen.getByText('Hard Reset…'))
    fireEvent.mouseDown(await screen.findByText('feature-x'))
    fireEvent.click(screen.getByRole('button', { name: 'Hard Reset' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'feature-x' }
    )
  })

  it('typing an arbitrary ref (tag or hash) offers it as a "Reset to" option', async () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Git Reset options'))
    fireEvent.click(screen.getByText('Hard Reset…'))

    const input = await screen.findByPlaceholderText('Search branches, or type a tag/commit hash…')
    fireEvent.change(input, { target: { value: 'v1.2.3' } })

    fireEvent.mouseDown(screen.getByText('Reset to "v1.2.3"'))
    fireEvent.click(screen.getByRole('button', { name: 'Hard Reset' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'v1.2.3' }
    )
  })
})
