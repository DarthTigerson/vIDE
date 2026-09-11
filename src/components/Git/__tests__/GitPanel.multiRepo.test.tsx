import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitFavoriteReposStore } from '@/stores/gitFavoriteReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import { useSearchStore } from '@/stores/searchStore'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

const repoBAheadBehind = { ahead: 1, behind: 2 }

// Mirrors setTwoRepos' pre-seeded statuses, so the mount refresh re-asserts the
// fixture instead of racing it back to empty.
function statusFor(cwd: string) {
  if (cwd.endsWith('repoA')) return { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] }
  if (cwd.endsWith('repoB')) return { staged: [{ path: 'b.ts', status: 'M' }], unstaged: [] }
  return { staged: [], unstaged: [] }
}

beforeEach(() => {
  // Every RepoSection refreshes its own repo on mount (branch + ahead/behind +
  // status), so gitBranch/gitAheadBehind have to be stubbed for all of these
  // tests, not just the ones that open the overview. The branch values match
  // setTwoRepos' fixture so the mount refresh doesn't contradict it.
  ;(global as any).window.api = {
    gitBranch: vi.fn((cwd: string) => Promise.resolve(cwd.endsWith('repoB') ? 'dev' : 'main')),
    gitAheadBehind: vi.fn((cwd: string) =>
      Promise.resolve(cwd.endsWith('repoB') ? repoBAheadBehind : null)
    ),
    gitStatus: vi.fn((cwd: string) => Promise.resolve(statusFor(cwd))),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    gitRunCommand: vi.fn().mockResolvedValue(undefined),
    onGitLogData: vi.fn(() => () => {}),
    onGitLogExit: vi.fn(() => () => {}),
    gitCommit: vi.fn().mockResolvedValue({ ok: true }),
    // A successful commit reloads the Graph tab's data when that tab is open,
    // which the Graph-button test leaves behind in editorStore.
    gitGraph: vi.fn().mockResolvedValue([]),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitFavoriteReposStore.setState({ favorites: {} })
  useGitOpenReposStore.setState({ open: {} })
  useSidebarUiStore.setState({ revealRequest: null })
  useSearchStore.setState({ repoPaletteOpen: false })
})

afterEach(() => {
  cleanup()
})

// Both repos start with a staged file and a commit message so the
// Commit-options chevron isn't disabled in tests that need to click it.
function setTwoRepos(selectedRepo = '/proj/repoA') {
  useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo })
  useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
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
    // The solo repo's own name must not appear: no accordion header at all.
    expect(screen.queryByText('proj')).toBeNull()
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

  it('highlights only the section matching selectedRepo (the active editor tab\'s repo)', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    const cardA = screen.getByText('repoA').closest('[role="button"]')?.parentElement
    const cardB = screen.getByText('repoB').closest('[role="button"]')?.parentElement
    expect(cardA?.className).toContain('border-accent')
    expect(cardB?.className).not.toContain('border-accent')
  })

  it('only the selected repo starts expanded; the other starts collapsed', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    const messageBoxes = screen.getAllByPlaceholderText('Message')
    expect(messageBoxes).toHaveLength(1)
  })

  it('clicking a collapsed repo\'s header expands it and collapses the previously-expanded one', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    // Only one repo's body is ever expanded at a time — expanding repoB
    // collapses repoA, rather than both being open simultaneously.
    expect(screen.getAllByPlaceholderText('Message')).toHaveLength(1)
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')
  })

  it('clicking back on the original repo\'s header re-expands it and collapses the other', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    fireEvent.click(screen.getByText('repoA'))
    expect(screen.getAllByPlaceholderText('Message')).toHaveLength(1)
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoA')
  })

  it('switching to a different repo does not leave the previous repo\'s commit-options popover open', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByLabelText('Commit options'))
    expect(screen.getByText('Commit --no-verify')).toBeTruthy()
    fireEvent.click(screen.getByText('repoB'))
    expect(screen.queryByText('Commit --no-verify')).toBeNull()
  })

  it('right-clicking a header and picking "Reveal in File Tree" requests a reveal for that specific repo', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.contextMenu(screen.getByText('repoB'))
    fireEvent.click(screen.getByText('Reveal in File Tree'))
    expect(useSidebarUiStore.getState().revealRequest).toEqual({ path: '/proj/repoB', expandTarget: true })
  })

  it('starring a repo sorts its section above the others', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    act(() => { useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoB') })
    const names = screen.getAllByText(/^repo[AB]$/).map((el) => el.textContent)
    expect(names).toEqual(['repoB', 'repoA'])
  })

  it('a non-selected (collapsed) repo\'s header fills in its branch and ahead/behind on mount', async () => {
    // The real post-project-open shape: fileStore only refreshes the selected
    // repo, so every other repo starts with no git state at all. Each section's
    // mount refresh (branch + ahead/behind, not just status) is what fills the
    // header in — otherwise repoB would sit on '—' with no counts forever.
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    useGitStore.setState({ repos: {} })
    render(<GitPanel />)

    await waitFor(() => expect(screen.getByText('dev')).toBeTruthy())
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('↓2')).toBeTruthy()
    expect(screen.getByText('↑1')).toBeTruthy()
    expect(useGitStore.getState().repos['/proj/repoB'].aheadBehind).toEqual(repoBAheadBehind)
  })

  it('acting on the currently-expanded repo (not the initial default) still targets that repo\'s own path', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    fireEvent.click(screen.getByText('Fetch'))
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj/repoB', 'fetch'
    )
  })

  it('committing with --no-verify on the currently-expanded repo targets that repo\'s own path and message', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('repoB'))
    fireEvent.click(screen.getByLabelText('Commit options'))
    fireEvent.click(screen.getByText('Commit --no-verify'))
    expect(window.api.gitCommit).toHaveBeenCalledWith('/proj/repoB', 'wip B', true)
  })

  it('picking a repo from "Show All Repos" expands it and scrolls to its section', () => {
    setTwoRepos('/proj/repoA')
    render(<GitPanel />)
    fireEvent.click(screen.getByText('Show All Repos'))
    // Scope to the palette itself — the panel behind it still renders its own
    // "repoB" header (collapsed) at the same time the overlay is open.
    const palette = screen.getByPlaceholderText('Find a repo…').closest('.fixed') as HTMLElement
    fireEvent.mouseDown(within(palette).getByText('repoB'))

    // Back in the accordion, repoB is now selected and therefore the only
    // one expanded — repoA collapses, since exactly one repo's body is ever
    // shown at a time.
    expect(screen.getAllByPlaceholderText('Message')).toHaveLength(1)
    // Its section was scrolled into view.
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
