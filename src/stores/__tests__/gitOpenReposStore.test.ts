import { describe, it, expect, beforeEach } from 'vitest'
import { useGitOpenReposStore } from '../gitOpenReposStore'

describe('gitOpenReposStore', () => {
  beforeEach(() => {
    useGitOpenReposStore.setState({ open: {} })
  })

  it('defaults to nothing open', () => {
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoA')).toBe(false)
  })

  it('openRepo marks a repo open', () => {
    useGitOpenReposStore.getState().openRepo('/proj/repoA')
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoA')).toBe(true)
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoB')).toBe(false)
  })

  it('openRepo is idempotent (no-op if already open)', () => {
    useGitOpenReposStore.getState().openRepo('/proj/repoA')
    const before = useGitOpenReposStore.getState().open
    useGitOpenReposStore.getState().openRepo('/proj/repoA')
    expect(useGitOpenReposStore.getState().open).toBe(before)
  })

  it('closeRepo removes a repo from the open set', () => {
    useGitOpenReposStore.getState().openRepo('/proj/repoA')
    useGitOpenReposStore.getState().openRepo('/proj/repoB')
    useGitOpenReposStore.getState().closeRepo('/proj/repoA')
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoA')).toBe(false)
    expect(useGitOpenReposStore.getState().isOpen('/proj/repoB')).toBe(true)
  })

  it('closeRepo is idempotent (no-op if already closed)', () => {
    const before = useGitOpenReposStore.getState().open
    useGitOpenReposStore.getState().closeRepo('/proj/repoA')
    expect(useGitOpenReposStore.getState().open).toBe(before)
  })

  it('closeAll clears every open repo', () => {
    useGitOpenReposStore.getState().openRepo('/proj/repoA')
    useGitOpenReposStore.getState().openRepo('/proj/repoB')
    useGitOpenReposStore.getState().closeAll()
    expect(useGitOpenReposStore.getState().open).toEqual({})
  })
})
