import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { RepoOverviewList } from '../RepoOverviewList'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitFavoriteReposStore } from '@/stores/gitFavoriteReposStore'
import { useGitExpandedReposStore } from '@/stores/gitExpandedReposStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import type { GitStatus, GitAheadBehind } from '@/types/index'

const repoAStatus: GitStatus = { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] }
const repoBStatus: GitStatus = { staged: [], unstaged: [] }
const repoAAheadBehind: GitAheadBehind = { ahead: 1, behind: 2 }

beforeEach(() => {
  ;(global as any).window.api = {
    gitBranch: vi.fn((cwd: string) => Promise.resolve(cwd.endsWith('repoA') ? 'main' : 'dev')),
    gitAheadBehind: vi.fn((cwd: string) => Promise.resolve(cwd.endsWith('repoA') ? repoAAheadBehind : null)),
    gitStatus: vi.fn((cwd: string) => Promise.resolve(cwd.endsWith('repoA') ? repoAStatus : repoBStatus)),
    gitListIgnored: vi.fn().mockResolvedValue([]),
  }
  useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
  useGitStore.setState({
    repos: {
      '/proj/repoA': { ...emptyRepoGitState, branch: 'main', status: repoAStatus, aheadBehind: repoAAheadBehind },
      '/proj/repoB': { ...emptyRepoGitState, branch: 'dev', status: repoBStatus, aheadBehind: null },
    },
  })
  useGitFavoriteReposStore.setState({ favorites: {} })
  useGitExpandedReposStore.setState({ expanded: {} })
})

afterEach(() => {
  cleanup()
})

describe('RepoOverviewList', () => {
  it('lists every repo with its name, branch, and staged/unstaged counts', () => {
    render(<RepoOverviewList onClose={vi.fn()} />)
    expect(screen.getByText('repoA')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('repoB')).toBeTruthy()
    expect(screen.getByText('dev')).toBeTruthy()
  })

  it('shows ahead/behind counts when present', () => {
    render(<RepoOverviewList onClose={vi.fn()} />)
    expect(screen.getByText('↓2')).toBeTruthy()
    expect(screen.getByText('↑1')).toBeTruthy()
  })

  it('re-fetches every repo on mount', async () => {
    render(<RepoOverviewList onClose={vi.fn()} />)
    await waitFor(() => {
      expect(window.api.gitBranch).toHaveBeenCalledWith('/proj/repoA')
      expect(window.api.gitBranch).toHaveBeenCalledWith('/proj/repoB')
    })
  })

  it('clicking a row selects that repo and closes the overview', () => {
    const onClose = vi.fn()
    render(<RepoOverviewList onClose={onClose} />)
    fireEvent.click(screen.getByText('repoB'))
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
    expect(onClose).toHaveBeenCalled()
  })

  it('typing in the filter box narrows the list to matching repo names', () => {
    render(<RepoOverviewList onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Find a repo (press / to search)'), { target: { value: 'B' } })
    expect(screen.queryByText('repoA')).toBeNull()
    expect(screen.getByText('repoB')).toBeTruthy()
  })

  it('pressing "/" focuses the filter box when nothing else has focus', () => {
    const { container } = render(<RepoOverviewList onClose={vi.fn()} />)
    const root = container.firstElementChild as HTMLElement
    const input = screen.getByPlaceholderText('Find a repo (press / to search)') as HTMLInputElement
    fireEvent.keyDown(root, { key: '/' })
    expect(document.activeElement).toBe(input)
  })

  it('starring a repo marks it favorite and sorts it to the top of the list', () => {
    render(<RepoOverviewList onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Favorite repoB'))

    expect(useGitFavoriteReposStore.getState().isFavorite('/proj/repoB')).toBe(true)
    const rowTexts = screen.getAllByText(/^repo[AB]$/).map((el) => el.textContent)
    expect(rowTexts).toEqual(['repoB', 'repoA'])
  })

  it('clicking the star does not also select the repo', () => {
    render(<RepoOverviewList onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Favorite repoB'))
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoA')
  })

  it('clicking a row marks that repo explicitly expanded and passes it to onClose', () => {
    const onClose = vi.fn()
    render(<RepoOverviewList onClose={onClose} />)
    fireEvent.click(screen.getByText('repoB'))
    expect(useGitExpandedReposStore.getState().isExpanded('/proj/repoB', '/proj/repoA')).toBe(true)
    expect(onClose).toHaveBeenCalledWith('/proj/repoB')
  })

  it('right-clicking "Go to File Tree" closes with no repo argument (does not force-expand)', () => {
    const onClose = vi.fn()
    render(<RepoOverviewList onClose={onClose} />)
    fireEvent.contextMenu(screen.getByText('repoB'))
    fireEvent.click(screen.getByText('Go to File Tree'))
    expect(onClose).toHaveBeenCalledWith()
  })

  it('right-clicking a row shows a context menu with "Go to File Tree", which requests a reveal and closes the overview', () => {
    const onClose = vi.fn()
    render(<RepoOverviewList onClose={onClose} />)
    fireEvent.contextMenu(screen.getByText('repoB'))

    const item = screen.getByText('Go to File Tree')
    expect(item).toBeTruthy()
    fireEvent.click(item)

    expect(useSidebarUiStore.getState().revealRequest).toEqual({ path: '/proj/repoB', expandTarget: true })
    expect(onClose).toHaveBeenCalled()
    // Right-click navigates via the file tree, not the git scope — it
    // shouldn't also change which repo the Git Panel is scoped to.
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoA')
  })
})
