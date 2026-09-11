import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'

// A full <App/> render isn't practical in jsdom (see App.autoFollow.test.tsx's
// note on Monaco/xterm/react-resizable-panels needing real browser APIs), so
// this reproduces App.tsx's gitBadge computation verbatim in isolation
// (VIDE-87): the activity-bar Git icon's change-count badge used to read only
// useRepoGitState(selectedRepo).status, which could show a number for a repo
// that isn't even open in the panel once multi-repo open/close shipped.
function useGitBadge() {
  const discoveredRepos = useGitReposStore((s) => s.repos)
  const openRepos = useGitOpenReposStore((s) => s.open)
  const allRepoGitStates = useGitStore((s) => s.repos)

  const badgeRepos = discoveredRepos.length <= 1 ? discoveredRepos : discoveredRepos.filter((repo) => openRepos[repo])
  const uncommittedChangeCount = new Set(
    badgeRepos.flatMap((repo) => {
      const status = (allRepoGitStates[repo] ?? emptyRepoGitState).status
      return [
        ...status.staged.map((file) => `${repo}:${file.path}`),
        ...status.unstaged.map((file) => `${repo}:${file.path}`),
      ]
    })
  ).size
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

  it('sums changes across every open repo, ignoring closed ones', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB', '/proj/repoC'], selectedRepo: '/proj/repoA' })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [] } },
        '/proj/repoB': { ...emptyRepoGitState, status: { staged: [], unstaged: [{ path: 'b.ts', status: 'M' }] } },
        '/proj/repoC': { ...emptyRepoGitState, status: { staged: [{ path: 'c.ts', status: 'M' }], unstaged: [] } },
      },
    })
    const { result } = renderHook(() => useGitBadge())
    expect(result.current).toBe(2)
  })

  it('dedupes a file staged and modified within the same repo, but not the same path across different repos', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoA' })
    useGitOpenReposStore.setState({ open: { '/proj/repoA': true, '/proj/repoB': true } })
    useGitStore.setState({
      repos: {
        '/proj/repoA': {
          ...emptyRepoGitState,
          status: { staged: [{ path: 'same.ts', status: 'M' }], unstaged: [{ path: 'same.ts', status: 'M' }] },
        },
        '/proj/repoB': { ...emptyRepoGitState, status: { staged: [{ path: 'same.ts', status: 'M' }], unstaged: [] } },
      },
    })
    const { result } = renderHook(() => useGitBadge())
    expect(result.current).toBe(2)
  })
})
