import { describe, it, expect, beforeEach, vi } from 'vitest'

const showMock = vi.hoisted(() => vi.fn())
const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

import { useGitReposStore } from '../gitReposStore'
import { useGitStore, emptyRepoGitState } from '../gitStore'
import { useGitFavoriteReposStore } from '../gitFavoriteReposStore'
import { useGitExpandedReposStore } from '../gitExpandedReposStore'

vi.mock('@/stores/statusMessageStore', () => ({
  useStatusMessageStore: { getState: () => ({ show: showMock }) },
}))

describe('gitReposStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useGitReposStore.setState({ repos: [], selectedRepo: null, hasExplicitSelection: false })
    useGitStore.setState({ repos: {} })
    useGitFavoriteReposStore.setState({ favorites: {} })
    useGitExpandedReposStore.setState({ expanded: {} })
  })

  it('starts with no repos and no selection', () => {
    const { repos, selectedRepo, hasExplicitSelection } = useGitReposStore.getState()
    expect(repos).toEqual([])
    expect(selectedRepo).toBeNull()
    expect(hasExplicitSelection).toBe(false)
  })

  it('setRepos with a single repo auto-selects it without marking it explicit', () => {
    useGitReposStore.getState().setRepos(['/proj'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj')
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(false)
  })

  it('setRepos resets hasExplicitSelection for a fresh project', () => {
    useGitReposStore.setState({ hasExplicitSelection: true })
    useGitReposStore.getState().setRepos(['/proj'])
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(false)
  })

  it('setRepos with multiple repos selects the first, sorted, one', () => {
    useGitReposStore.getState().setRepos(['/parent/repoB', '/parent/repoA'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoB')
  })

  it('setRepos preserves the current selection if it is still in the new list', () => {
    useGitReposStore.setState({ repos: ['/repoA', '/repoB'], selectedRepo: '/repoB' })
    useGitReposStore.getState().setRepos(['/repoA', '/repoB'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/repoB')
  })

  it('setRepos falls back to the first repo if the current selection is gone', () => {
    useGitReposStore.setState({ repos: ['/repoA', '/repoB'], selectedRepo: '/repoB' })
    useGitReposStore.getState().setRepos(['/repoA', '/repoC'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/repoA')
  })

  it('setRepos defaults to a favorited repo over the alphabetically-first one', () => {
    useGitFavoriteReposStore.setState({ favorites: { '/parent/repoC': true } })
    useGitReposStore.getState().setRepos(['/parent/repoA', '/parent/repoB', '/parent/repoC'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoC')
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(false)
  })

  it('setRepos still prefers a valid current selection over a favorite', () => {
    useGitFavoriteReposStore.setState({ favorites: { '/parent/repoC': true } })
    useGitReposStore.setState({ repos: ['/parent/repoB'], selectedRepo: '/parent/repoB' })
    useGitReposStore.getState().setRepos(['/parent/repoB', '/parent/repoC'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoB')
  })

  it('setRepos falls back to the first sorted repo when no favorite is among the discovered repos', () => {
    useGitFavoriteReposStore.setState({ favorites: { '/parent/repoZ': true } })
    useGitReposStore.getState().setRepos(['/parent/repoB', '/parent/repoA'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoB')
  })

  it('setRepos with an empty list clears the selection', () => {
    useGitReposStore.setState({ repos: ['/repoA'], selectedRepo: '/repoA' })
    useGitReposStore.getState().setRepos([])
    expect(useGitReposStore.getState().selectedRepo).toBeNull()
  })

  it('selectRepo sets the selection directly and marks it explicit', () => {
    useGitReposStore.setState({ repos: ['/repoA', '/repoB'] })
    useGitReposStore.getState().selectRepo('/repoB')
    expect(useGitReposStore.getState().selectedRepo).toBe('/repoB')
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(true)
  })

  it('resolveRepoForPath matches the containing repo by longest prefix', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA', '/parent/repoA-longer'] })
    expect(useGitReposStore.getState().resolveRepoForPath('/parent/repoA-longer/src/x.ts')).toBe('/parent/repoA-longer')
    expect(useGitReposStore.getState().resolveRepoForPath('/parent/repoA/src/x.ts')).toBe('/parent/repoA')
  })

  it('resolveRepoForPath returns the repo itself for an exact match', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA'] })
    expect(useGitReposStore.getState().resolveRepoForPath('/parent/repoA')).toBe('/parent/repoA')
  })

  it('resolveRepoForPath returns null when no repo contains the path', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA'] })
    expect(useGitReposStore.getState().resolveRepoForPath('/elsewhere/file.ts')).toBeNull()
  })

  it('followFilePath switches selectedRepo, marks it explicit, and shows a notice when the file is in a different repo', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA', '/parent/repoB'], selectedRepo: '/parent/repoA' })
    useGitStore.setState({ repos: { '/parent/repoB': { ...emptyRepoGitState, branch: 'main' } } })

    useGitReposStore.getState().followFilePath('/parent/repoB/src/x.ts')

    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoB')
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(true)
    expect(showMock).toHaveBeenCalledWith('Switched to repoB on main')
  })

  it('followFilePath omits the branch clause when the branch is not yet known', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA', '/parent/repoB'], selectedRepo: '/parent/repoA' })

    useGitReposStore.getState().followFilePath('/parent/repoB/src/x.ts')

    expect(showMock).toHaveBeenCalledWith('Switched to repoB')
  })

  it('followFilePath marks the selection explicit but stays silent when the file is already in the selected repo', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA'], selectedRepo: '/parent/repoA', hasExplicitSelection: false })
    useGitReposStore.getState().followFilePath('/parent/repoA/src/x.ts')
    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoA')
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(true)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('followFilePath does nothing when the path is outside every known repo', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA'], selectedRepo: '/parent/repoA', hasExplicitSelection: false })
    useGitReposStore.getState().followFilePath('/elsewhere/file.ts')
    expect(useGitReposStore.getState().selectedRepo).toBe('/parent/repoA')
    expect(useGitReposStore.getState().hasExplicitSelection).toBe(false)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('followFilePath marks the newly-followed repo explicitly expanded', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA', '/parent/repoB'], selectedRepo: '/parent/repoA' })
    useGitReposStore.getState().followFilePath('/parent/repoB/src/x.ts')
    expect(useGitExpandedReposStore.getState().isExpanded('/parent/repoB', '/parent/repoA')).toBe(true)
  })

  it('followFilePath does not collapse the repo it switches away from', () => {
    useGitReposStore.setState({ repos: ['/parent/repoA', '/parent/repoB'], selectedRepo: '/parent/repoA' })
    useGitExpandedReposStore.getState().setExpanded('/parent/repoA', true)
    useGitReposStore.getState().followFilePath('/parent/repoB/src/x.ts')
    expect(useGitExpandedReposStore.getState().isExpanded('/parent/repoA', '/parent/repoB')).toBe(true)
  })
})
