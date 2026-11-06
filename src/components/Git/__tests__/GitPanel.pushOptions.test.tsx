import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import type { GitStatus } from '@/types/index'

const emptyStatus: GitStatus = { staged: [], unstaged: [] }

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
  useGitStore.setState({
    // An already-published branch: with no upstream the primary button
    // becomes Publish and the menu drops its Publish Branch row.
    repos: { '/proj': { ...emptyRepoGitState, status: emptyStatus, branch: 'main', aheadBehind: { ahead: 0, behind: 0 } } },
  })
  useGitSettingsStore.setState({ forceSafetyEnabled: false })
})

afterEach(() => {
  cleanup()
  useGitSettingsStore.setState({ forceSafetyEnabled: true })
})

describe('GitPanel — push options (force push)', () => {
  it('the options panel is closed by default', () => {
    render(<GitPanel />)
    expect(screen.queryByText('Force Push')).toBeNull()
  })

  it('clicking the options chevron opens a panel with Publish Branch, Force Push, and Force Push with Lease', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    expect(screen.getByText('Publish Branch')).toBeTruthy()
    expect(screen.getByText('Force Push')).toBeTruthy()
    expect(screen.getByText('Force Push with Lease')).toBeTruthy()
  })

  it('shows the actual git command for Publish Branch, using the current branch name', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    expect(screen.getByText('git push -u origin main')).toBeTruthy()
  })

  it('clicking Publish Branch runs push --set-upstream origin <branch> and closes the panel', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    fireEvent.click(screen.getByText('Publish Branch'))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'publishBranch', { branch: 'main' }
    )
    expect(screen.queryByText('Publish Branch')).toBeNull()
  })

  it('Publish Branch is disabled when there is no current branch', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: emptyStatus, branch: null } } })
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))

    expect(screen.getByText('Publish Branch').closest('button')).toBeDisabled()
  })

  it('clicking Force Push runs a force push and closes the panel (safety off)', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    fireEvent.click(screen.getByText('Force Push'))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'forcePush')
    expect(screen.queryByText('Force Push')).toBeNull()
  })

  it('clicking Force Push with Lease runs that variant (safety off)', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    fireEvent.click(screen.getByText('Force Push with Lease'))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'forcePushLease')
  })

  it('with force-push safety on, Force Push opens the confirmation modal instead of running immediately', () => {
    useGitSettingsStore.setState({ forceSafetyEnabled: true })
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    fireEvent.click(screen.getByText('Force Push'))

    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm')).toBeTruthy()
  })

  it('clicking outside the panel closes it without pushing', () => {
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Push options'))
    expect(screen.getByText('Force Push')).toBeTruthy()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByText('Force Push')).toBeNull()
    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })
})
