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

// Reset, Hard Reset, and Undo Last Commit all live behind the "Git
// Functions" dropdown trigger now — it has no separate primary action to
// click directly, so every case opens it first.
function openGitFunctions() {
  fireEvent.click(screen.getByRole('button', { name: 'Git Functions' }))
}

describe('GitPanel — Reset (discard to HEAD / Hard Reset)', () => {
  it('the options panel is closed by default', () => {
    render(<GitPanel />)
    expect(screen.queryByText('Hard Reset…')).toBeNull()
  })

  it('clicking Reset opens a confirm modal instead of running immediately', () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Reset'))

    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
    expect(screen.getByText(/restore it to its last commit/)).toBeTruthy()
  })

  it('confirming Reset runs a hard reset to HEAD', () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Reset'))
    // The dropdown item closes with the panel once clicked, so only the
    // modal's own confirm button is left with this name.
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'HEAD' }
    )
  })

  it('cancelling Reset does not run anything', () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Reset'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })

  it('opening Git Functions shows Reset, Hard Reset…, and Undo Last Commit', () => {
    render(<GitPanel />)
    openGitFunctions()
    expect(screen.getByText('Hard Reset…')).toBeTruthy()
    expect(screen.getByText('Undo Last Commit')).toBeTruthy()
  })

  it('clicking Hard Reset… opens the ref picker listing branches', async () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Hard Reset…'))

    expect(await screen.findByText('feature-x')).toBeTruthy()
    expect(screen.getByText('hotfix')).toBeTruthy()
  })

  it('picking a remote branch runs hard reset with the full remote ref', async () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Hard Reset…'))
    fireEvent.mouseDown(await screen.findByText('hotfix'))
    fireEvent.click(screen.getByRole('button', { name: 'Hard Reset' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'origin/hotfix' }
    )
  })

  it('picking a local branch opens the hard-reset confirm with that ref', async () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Hard Reset…'))
    fireEvent.mouseDown(await screen.findByText('feature-x'))

    expect(screen.getByRole('button', { name: 'Hard Reset' })).toBeTruthy()
    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })

  it('confirming hard reset runs it with the picked ref', async () => {
    render(<GitPanel />)
    openGitFunctions()
    fireEvent.click(screen.getByText('Hard Reset…'))
    fireEvent.mouseDown(await screen.findByText('feature-x'))
    fireEvent.click(screen.getByRole('button', { name: 'Hard Reset' }))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'feature-x' }
    )
  })

  it('typing an arbitrary ref (tag or hash) offers it as a "Reset to" option', async () => {
    render(<GitPanel />)
    openGitFunctions()
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
