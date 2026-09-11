import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitFavoriteReposStore } from '@/stores/gitFavoriteReposStore'
import { useGitExpandedReposStore } from '@/stores/gitExpandedReposStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'

beforeEach(() => {
  ;(global as any).window.api = {
    gitStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [] }),
    gitListIgnored: vi.fn().mockResolvedValue([]),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitFavoriteReposStore.setState({ favorites: {} })
  useGitExpandedReposStore.setState({ expanded: {} })
  useSidebarUiStore.setState({ revealRequest: null })
})

afterEach(() => {
  cleanup()
})

// Both repos start with a staged file and a commit message so the
// Commit-options chevron isn't disabled in tests that need to click it.
function setTwoRepos(selectedRepo = '/proj/repoA') {
  useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo })
  useGitStore.setState({
    repos: {
      '/proj/repoA': {
        ...emptyRepoGitState,
        branch: 'main',
        status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] },
        commitMessage: 'wip A',
      },
      '/proj/repoB': {
        ...emptyRepoGitState,
        branch: 'dev',
        status: { staged: [{ path: 'b.ts', status: 'M' }], unstaged: [] },
        commitMessage: 'wip B',
      },
    },
  })
}

describe('GitPanel — multi-repo accordion', () => {
  it('renders no header chrome when only one repo is open', () => {
    useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState } } })
    render(<GitPanel />)
    expect(screen.queryByText('repoA')).toBeNull()
    expect(screen.queryByText('Show All Repos')).toBeNull()
    // The commit box is visible directly, with no collapsible wrapper.
    expect(screen.getByPlaceholderText('Message')).toBeTruthy()
  })

  it('shows a collapsible header for each repo when more than one is open', () => {
    setTwoRepos()
    render(<GitPanel />)
    expect(screen.getByText('repoA')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('repoB')).toBeTruthy()
    expect(screen.getByText('dev')).toBeTruthy()
  })

  it('only the selected repo starts expanded; the other starts collapsed', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    const messageBoxes = screen.getAllByPlaceholderText('Message')
    expect(messageBoxes).toHaveLength(1)
  })

  it('clicking a collapsed repo\'s header expands it without collapsing the other', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    expect(screen.getAllByPlaceholderText('Message')).toHaveLength(2)
  })

  it('collapsing the previously-expanded repo leaves a manually-expanded one open', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    fireEvent.click(screen.getByText('repoA'))
    expect(screen.getAllByPlaceholderText('Message')).toHaveLength(1)
    expect(useGitExpandedReposStore.getState().isExpanded('/proj/repoB', '/proj/repoA')).toBe(true)
  })

  it('each expanded repo\'s commit-options popover is independent', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    const optionButtons = screen.getAllByLabelText('Commit options')
    fireEvent.click(optionButtons[0])
    expect(screen.getAllByText('Commit --no-verify')).toHaveLength(1)
  })

  it('the reveal-in-file-tree button on a header requests a reveal for that specific repo', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    const revealButtons = screen.getAllByLabelText('Reveal in File Tree')
    fireEvent.click(revealButtons[1])
    expect(useSidebarUiStore.getState().revealRequest).toEqual({ path: '/proj/repoB', expandTarget: true })
  })

  it('starring a repo sorts its section above the others', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    act(() => { useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoB') })
    const names = screen.getAllByText(/^repo[AB]$/).map((el) => el.textContent)
    expect(names).toEqual(['repoB', 'repoA'])
  })

  it('clicking a non-selected repo\'s Branch button makes it the selected repo', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    const branchButtons = screen.getAllByText(/^Branch:/)
    fireEvent.click(branchButtons[1])
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
  })

  it('clicking a non-selected repo\'s Graph button makes it the selected repo', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    const graphButtons = screen.getAllByText('Graph')
    fireEvent.click(graphButtons[1])
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
  })

  it('clicking a non-selected repo\'s List Diff button makes it the selected repo', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    const listDiffButtons = screen.getAllByText('List Diff')
    fireEvent.click(listDiffButtons[1])
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
  })
})
