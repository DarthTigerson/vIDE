import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGitTreeDecorations } from '../useGitTreeDecorations'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'

beforeEach(() => {
  useGitReposStore.setState({ repos: [], selectedRepo: null, hasExplicitSelection: false })
  useGitStore.setState({ repos: {} })
})

describe('useGitTreeDecorations', () => {
  it('returns no decorations when the project has no repos', () => {
    const { result } = renderHook(() => useGitTreeDecorations())
    expect(result.current.files.size).toBe(0)
    expect(result.current.folders.size).toBe(0)
  })

  it('decorates a changed file and its ancestor folders, scoped to the right repo', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'] })
    useGitStore.setState({
      repos: {
        '/proj/repoA': { ...emptyRepoGitState, status: { staged: [], unstaged: [{ path: 'src/App.tsx', status: 'M' }] } },
        '/proj/repoB': { ...emptyRepoGitState, status: { staged: [], unstaged: [] } },
      },
    })

    const { result } = renderHook(() => useGitTreeDecorations())
    expect(result.current.files.get('/proj/repoA/src/App.tsx')?.code).toBe('M')
    expect(result.current.folders.get('/proj/repoA/src')?.code).toBe('M')
    expect(result.current.folders.has('/proj/repoB')).toBe(false)
  })

  it('does not recompute (same Map references) when an unrelated part of a repo\'s git state changes', () => {
    useGitReposStore.setState({ repos: ['/proj'] })
    useGitStore.setState({
      repos: { '/proj': { ...emptyRepoGitState, status: { staged: [{ path: 'a.ts', status: 'A' }], unstaged: [] } } },
    })

    const { result, rerender } = renderHook(() => useGitTreeDecorations())
    const filesBefore = result.current.files
    const foldersBefore = result.current.folders

    // A commit-message keystroke (or a command-status flip) replaces the
    // repo's state object but leaves `status` itself untouched — this must
    // not trigger a recompute of the decoration maps.
    useGitStore.getState().setCommitMessage('/proj', 'wip')
    rerender()

    expect(result.current.files).toBe(filesBefore)
    expect(result.current.folders).toBe(foldersBefore)
  })

  it('recomputes when a repo\'s actual status changes', () => {
    useGitReposStore.setState({ repos: ['/proj'] })
    useGitStore.setState({
      repos: { '/proj': { ...emptyRepoGitState, status: { staged: [], unstaged: [] } } },
    })

    const { result, rerender } = renderHook(() => useGitTreeDecorations())
    expect(result.current.files.size).toBe(0)
    const foldersBefore = result.current.folders

    useGitStore.setState({
      repos: { '/proj': { ...emptyRepoGitState, status: { staged: [], unstaged: [{ path: 'b.ts', status: 'M' }] } } },
    })
    rerender()

    expect(result.current.files.get('/proj/b.ts')?.code).toBe('M')
    expect(result.current.folders).not.toBe(foldersBefore)
  })
})
