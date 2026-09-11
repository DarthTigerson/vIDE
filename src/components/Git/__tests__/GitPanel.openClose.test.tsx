import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitFavoriteReposStore } from '@/stores/gitFavoriteReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  ;(global as any).window.api = {
    gitBranch: vi.fn((cwd: string) => Promise.resolve(cwd.endsWith('repoB') ? 'dev' : 'main')),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [] }),
    gitListIgnored: vi.fn().mockResolvedValue([]),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitFavoriteReposStore.setState({ favorites: {} })
  useGitOpenReposStore.setState({ open: {} })
})

afterEach(() => {
  cleanup()
})

function setTwoUnopenedRepos(selectedRepo = '/proj/repoA') {
  useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo })
  useGitStore.setState({
    repos: {
      '/proj/repoA': { ...emptyRepoGitState, branch: 'main' },
      '/proj/repoB': { ...emptyRepoGitState, branch: 'dev' },
    },
  })
}

describe('GitPanel — multi-repo open/close', () => {
  it('starts with zero repos open in a multi-repo project', () => {
    setTwoUnopenedRepos()
    render(<GitPanel />)
    expect(screen.queryByText('repoA')).toBeNull()
    expect(screen.queryByText('repoB')).toBeNull()
    expect(screen.queryByPlaceholderText('Message')).toBeNull()
    expect(screen.getByText(/No repos open/)).toBeTruthy()
  })

  it('a single-repo project is unaffected: shows directly, no open/close chrome', () => {
    useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState } } })
    render(<GitPanel />)
    expect(screen.queryByText('Show All Repos')).toBeNull()
    expect(screen.getByPlaceholderText('Message')).toBeTruthy()
  })

  it('zero discovered repos (closed project) renders nothing below the header, same as before this feature', () => {
    useGitReposStore.setState({ repos: [], selectedRepo: null })
    render(<GitPanel />)
    expect(screen.queryByText(/No repos open/)).toBeNull()
    expect(screen.queryByText('Show All Repos')).toBeNull()
    expect(screen.queryByPlaceholderText('Message')).toBeNull()
  })

  it('opening a repo from "Show All Repos" adds it to the panel', () => {
    setTwoUnopenedRepos()
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Show All Repos'))
    fireEvent.click(screen.getByText('repoB'))
    expect(screen.getByText('repoB')).toBeTruthy()
    expect(screen.queryByText('repoA')).toBeNull()
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoB')).toBe(true)
  })

  it('right-clicking a header and picking "Close Repo" removes it from the panel without touching discovery or its git data, and activates a remaining open repo', () => {
    setTwoUnopenedRepos('/proj/repoA')
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    render(<GitPanel />)
    fireEvent.contextMenu(screen.getByText('repoA'))
    fireEvent.click(screen.getByText('Close Repo'))
    expect(screen.queryByText('repoA')).toBeNull()
    expect(screen.getByText('repoB')).toBeTruthy()
    expect(useGitReposStore.getState().repos).toEqual(['/proj/repoA', '/proj/repoB'])
    // repoA (closed, and previously the active/expanded one) can't stay
    // selected — nothing would show as expanded at all — so repoB, the only
    // remaining open repo, becomes active instead.
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
    expect(useGitStore.getState().repos['/proj/repoA']).toEqual({ ...emptyRepoGitState, branch: 'main' })
  })

  it('right-clicking a header and picking "Close All Repos" bulk-closes every open repo back to the empty state', () => {
    setTwoUnopenedRepos()
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    render(<GitPanel />)
    fireEvent.contextMenu(screen.getByText('repoA'))
    fireEvent.click(screen.getByText('Close All Repos'))
    expect(screen.queryByText('repoA')).toBeNull()
    expect(screen.queryByText('repoB')).toBeNull()
    expect(screen.getByText(/No repos open/)).toBeTruthy()
  })

  it('opening a file from an unopened repo auto-opens its section', () => {
    setTwoUnopenedRepos('/proj/repoA')
    render(<GitPanel />)
    act(() => { useGitReposStore.getState().followFilePath('/proj/repoB/src/x.ts') })
    expect(screen.getByText('repoB')).toBeTruthy()
  })

  it('a fresh setRepos call resets a previously-open set to empty', () => {
    setTwoUnopenedRepos()
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true } })
    act(() => { useGitReposStore.getState().setRepos(['/proj/repoA', '/proj/repoB']) })
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoA')).toBe(false)
  })
})
