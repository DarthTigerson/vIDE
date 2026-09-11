import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useGitStore, useRepoGitState, emptyRepoGitState } from '@/stores/gitStore'

// A full <App/> render isn't practical in jsdom (see App.autoFollow.test.tsx's
// note on Monaco/xterm/react-resizable-panels needing real browser APIs), so
// this reproduces App.tsx's gitBadge computation verbatim in isolation
// (VIDE-87): the activity-bar Git icon's change-count badge should mirror
// exactly the one repo currently expanded in the Git panel, not a sum across
// every open repo, and should hide entirely when nothing is open.
function useGitBadge() {
  const discoveredRepos = useGitReposStore((s) => s.repos)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const openRepos = useGitOpenReposStore((s) => s.open)

  const badgeRepo = discoveredRepos.length <= 1
    ? (discoveredRepos[0] ?? null)
    : (Object.keys(openRepos).length > 0 ? selectedRepo : null)
  const badgeStatus = useRepoGitState(badgeRepo).status
  const uncommittedChangeCount = new Set([
    ...badgeStatus.staged.map((file) => file.path),
    ...badgeStatus.unstaged.map((file) => file.path),
  ]).size
  return uncommittedChangeCount > 99 ? '99+' : uncommittedChangeCount || undefined
}

beforeEach(() => {
  useGitReposStore.setState({ repos: [], selectedRepo: null })
  useGitOpenReposStore.setState({ open: {} })
  useGitStore.setState({ repos: {} })
})

describe('App — Git activity-bar badge (VIDE-87)', () => {
  it("counts a solo repo's changes even though it has no open/close chrome", () => {
    useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
    useGitStore.setState({
      repos: { '/proj': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] } } },
    })
    const { result } = renderHook(() => useGitBadge())
    expect(result.current).toBe(1)
  })

  it('shows no badge in a multi-repo project when nothing is open, even if the auto-selected repo has changes', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] } },
      },
    })
    // repoA is selectedRepo (auto-picked by setRepos) but isn't open in the panel.
    const { result } = renderHook(() => useGitBadge())
    expect(result.current).toBeUndefined()
  })

  it('counts only the active (expanded) repo, ignoring other open repos\' changes', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB', '/proj/repoC'], selectedRepo: '/proj/repoB' })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true, '/proj/repoC': true } })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] } },
        '/proj/repoB': { ...emptyRepoGitState, status: { staged: [], unstaged: [{ path: 'b1.ts', status: 'M' }, { path: 'b2.ts', status: 'M' }] } },
        '/proj/repoC': { ...emptyRepoGitState, status: { staged: [{ path: 'c.ts', status: 'M' }], unstaged: [] } },
      },
    })
    const { result } = renderHook(() => useGitBadge())
    expect(result.current).toBe(2)
  })

  it('dedupes a file staged and modified within the active repo', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    useGitStore.setState({
      repos: {
        '/proj/repoA': {
          ...emptyRepoGitState,
          status: { staged: [{ path: 'same.ts', status: 'M' }], unstaged: [{ path: 'same.ts', status: 'M' }] },
        },
        '/proj/repoB': { ...emptyRepoGitState, status: { staged: [{ path: 'other.ts', status: 'M' }], unstaged: [] } },
      },
    })
    const { result } = renderHook(() => useGitBadge())
    expect(result.current).toBe(1)
  })

  it('follows a switch of the active repo (e.g. clicking a different header)', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] } },
        '/proj/repoB': { ...emptyRepoGitState, status: { staged: [], unstaged: [] } },
      },
    })
    const { result, rerender } = renderHook(() => useGitBadge())
    expect(result.current).toBe(1)

    act(() => { useGitReposStore.setState({ selectedRepo: '/proj/repoB' }) })
    rerender()
    expect(result.current).toBeUndefined()
  })
})
