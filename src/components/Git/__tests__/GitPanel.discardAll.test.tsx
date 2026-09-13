import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import type { GitStatus } from '@/types/index'

const trackedChange: GitStatus = {
  staged: [],
  unstaged: [{ path: 'src/App.tsx', status: 'M' }],
}
const untrackedOnly: GitStatus = {
  staged: [],
  unstaged: [{ path: 'new-file.ts', status: '?' }],
}
const noChanges: GitStatus = { staged: [], unstaged: [] }

beforeEach(() => {
  ;(global as any).window.api = {
    // RepoSection does a full refresh (branch + ahead/behind + status) on mount.
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitStatus: vi.fn().mockResolvedValue(trackedChange),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    gitDiscardAll: vi.fn().mockResolvedValue(undefined),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({
    repos: {
      '/proj': { ...emptyRepoGitState, status: trackedChange, commandStatus: 'idle', commitMessage: '', commitError: null },
    },
  })
})

afterEach(() => {
  cleanup()
})

function discardAllButton() {
  return screen.getByRole('button', { name: 'Discard All Changes' })
}

describe('GitPanel — Discard All Changes', () => {
  it('is enabled when there are tracked changes', () => {
    render(<GitPanel />)
    expect(discardAllButton()).not.toBeDisabled()
  })

  it('is disabled when only untracked files are present', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: untrackedOnly } } })
    render(<GitPanel />)
    expect(discardAllButton()).toBeDisabled()
  })

  it('is disabled when there are no changes at all', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: noChanges } } })
    render(<GitPanel />)
    expect(discardAllButton()).toBeDisabled()
  })

  it('is disabled when there are staged changes but no unstaged changes (VIDE-11: staged changes are never discarded by this button)', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] } } } })
    render(<GitPanel />)
    expect(discardAllButton()).toBeDisabled()
  })

  it('opens a confirmation modal instead of discarding immediately', () => {
    render(<GitPanel />)
    fireEvent.click(discardAllButton())

    expect(screen.getByText('Discard All Changes')).toBeTruthy()
    expect(window.api.gitDiscardAll).not.toHaveBeenCalled()
  })

  it('the confirmation modal makes clear staged changes are safe (VIDE-11)', () => {
    render(<GitPanel />)
    fireEvent.click(discardAllButton())

    const modalText = screen.getByText('Discard All Changes').parentElement?.textContent ?? ''
    expect(modalText.replace(/\s+/g, ' ')).toContain('Staged changes and untracked files are left alone')
  })

  it('cancel closes the modal without discarding', () => {
    render(<GitPanel />)
    fireEvent.click(discardAllButton())
    fireEvent.click(screen.getByText('Cancel'))

    expect(window.api.gitDiscardAll).not.toHaveBeenCalled()
    expect(screen.queryByText('Untracked files are left', { exact: false })).toBeNull()
  })

  it('confirming calls gitDiscardAll for the project root', async () => {
    render(<GitPanel />)
    fireEvent.click(discardAllButton())
    fireEvent.click(screen.getByRole('button', { name: 'Discard All' }))

    await waitFor(() => expect(window.api.gitDiscardAll).toHaveBeenCalledWith('/proj'))
  })
})
