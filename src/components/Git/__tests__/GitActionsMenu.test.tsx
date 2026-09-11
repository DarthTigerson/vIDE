import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GitActionsMenu } from '../GitActionsMenu'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitFavoriteReposStore } from '@/stores/gitFavoriteReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSearchStore } from '@/stores/searchStore'

beforeEach(() => {
  ;(global as any).window.api = {
    gitRunCommand: vi.fn().mockResolvedValue(undefined),
    onGitLogData: vi.fn().mockReturnValue(() => {}),
    onGitLogExit: vi.fn().mockReturnValue(() => {}),
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [] }),
    gitListIgnored: vi.fn().mockResolvedValue([]),
  }
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj', hasExplicitSelection: false })
  useGitStore.setState({
    repos: { '/proj': { ...emptyRepoGitState, branch: 'main' } },
  })
  useGitFavoriteReposStore.setState({ favorites: {} })
  useGitOpenReposStore.setState({ open: {} })
  useSearchStore.setState({ branchPaletteOpen: false })
})

afterEach(() => {
  cleanup()
})

describe('GitActionsMenu', () => {
  it('does not show an Open Repos section for a single-repo project', () => {
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={vi.fn()} />)
    expect(screen.queryByText('Open Repos')).toBeNull()
  })

  it('does not show an Open Repos section in a multi-repo project when nothing is open', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, branch: 'main' },
        '/proj/repoB': { ...emptyRepoGitState, branch: 'dev' },
      },
    })
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={vi.fn()} />)
    expect(screen.queryByText('Open Repos')).toBeNull()
  })

  it('shows an Open Repos section listing only repos open in the Git panel, not every discovered repo', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB', '/proj/repoC'], selectedRepo: '/proj/repoA' })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, branch: 'main' },
        '/proj/repoB': { ...emptyRepoGitState, branch: 'dev' },
        '/proj/repoC': { ...emptyRepoGitState, branch: 'dev' },
      },
    })
    useGitOpenReposStore.setState({ open: { '/proj/repoB': true } })
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={vi.fn()} />)
    expect(screen.getByText('Open Repos')).toBeTruthy()
    expect(screen.getByText('repoB')).toBeTruthy()
    expect(screen.queryByText('repoA')).toBeNull()
    expect(screen.queryByText('repoC')).toBeNull()
  })

  it('lists open repos favorites-first, matching the Git panel\'s own order', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, branch: 'main' },
        '/proj/repoB': { ...emptyRepoGitState, branch: 'dev' },
      },
    })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    useGitFavoriteReposStore.setState({ favorites: { '/proj/repoB': true } })
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={vi.fn()} />)
    const names = screen.getAllByText(/^repo[AB]$/).map((el) => el.textContent)
    expect(names).toEqual(['repoB', 'repoA'])
  })

  it('clicking an open repo selects it and closes the menu', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, branch: 'main' },
        '/proj/repoB': { ...emptyRepoGitState, branch: 'dev' },
      },
    })
    useGitOpenReposStore.setState({ open: { '/proj/repoB': true } })
    const onClose = vi.fn()
    render(<GitActionsMenu onClose={onClose} onRequestForce={vi.fn()} />)
    fireEvent.click(screen.getByText('repoB'))

    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking "Switch Branch…" opens the branch palette and closes the menu', () => {
    const onClose = vi.fn()
    render(<GitActionsMenu onClose={onClose} onRequestForce={vi.fn()} />)
    fireEvent.click(screen.getByText('Switch Branch…'))

    expect(useSearchStore.getState().branchPaletteOpen).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking Fetch runs a fetch and closes the menu', async () => {
    const onClose = vi.fn()
    render(<GitActionsMenu onClose={onClose} onRequestForce={vi.fn()} />)
    fireEvent.click(screen.getByText('Fetch'))

    expect(onClose).toHaveBeenCalled()
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'fetch')
  })

  it('clicking Publish Branch pushes with --set-upstream for the current branch and closes the menu', () => {
    const onClose = vi.fn()
    render(<GitActionsMenu onClose={onClose} onRequestForce={vi.fn()} />)
    fireEvent.click(screen.getByText('Publish Branch'))

    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'publishBranch', { branch: 'main' }
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('Publish Branch is disabled when there is no current branch', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, branch: null } } })
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={vi.fn()} />)
    expect(screen.getByText('Publish Branch').closest('button')).toBeDisabled()
  })

  it('clicking Force Push delegates to onRequestForce and closes the menu', () => {
    const onClose = vi.fn()
    const onRequestForce = vi.fn()
    render(<GitActionsMenu onClose={onClose} onRequestForce={onRequestForce} />)
    fireEvent.click(screen.getByText('Force Push'))

    expect(onRequestForce).toHaveBeenCalledWith('forcePush')
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking Force Push with Lease delegates to onRequestForce and closes the menu', () => {
    const onRequestForce = vi.fn()
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={onRequestForce} />)
    fireEvent.click(screen.getByText('Force Push with Lease'))

    expect(onRequestForce).toHaveBeenCalledWith('forcePushLease')
  })

  it('disables git action items while a command is running', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, branch: 'main', commandStatus: 'running' } } })
    render(<GitActionsMenu onClose={vi.fn()} onRequestForce={vi.fn()} />)

    expect(screen.getByText('Fetch').closest('button')).toBeDisabled()
    expect(screen.getByText('Pull').closest('button')).toBeDisabled()
    expect(screen.getByText('Push').closest('button')).toBeDisabled()
    expect(screen.getByText('Publish Branch').closest('button')).toBeDisabled()
    expect(screen.getByText('Force Push').closest('button')).toBeDisabled()
  })
})
