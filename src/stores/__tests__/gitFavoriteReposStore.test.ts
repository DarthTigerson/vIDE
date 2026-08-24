import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

import { useGitFavoriteReposStore, sortReposByFavorite } from '../gitFavoriteReposStore'

describe('gitFavoriteReposStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useGitFavoriteReposStore.setState({ favorites: {} })
  })

  it('starts with no favorites', () => {
    expect(useGitFavoriteReposStore.getState().isFavorite('/proj/repoA')).toBe(false)
  })

  it('toggleFavorite marks a repo favorite, and toggling again unmarks it', () => {
    useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoA')
    expect(useGitFavoriteReposStore.getState().isFavorite('/proj/repoA')).toBe(true)

    useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoA')
    expect(useGitFavoriteReposStore.getState().isFavorite('/proj/repoA')).toBe(false)
  })

  it('persists favorites to localStorage and survives a fresh store creation', () => {
    useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoA')
    expect(JSON.parse(localStorageStore['vide:git:favoriteRepos'])).toEqual({ '/proj/repoA': true })
  })

  it('keeps other repos independent when toggling one', () => {
    useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoA')
    useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoB')
    useGitFavoriteReposStore.getState().toggleFavorite('/proj/repoA')

    expect(useGitFavoriteReposStore.getState().isFavorite('/proj/repoA')).toBe(false)
    expect(useGitFavoriteReposStore.getState().isFavorite('/proj/repoB')).toBe(true)
  })
})

describe('sortReposByFavorite', () => {
  it('sorts favorites first, alphabetically within each group', () => {
    const repos = ['/proj/zeta', '/proj/alpha', '/proj/beta', '/proj/gamma']
    const favorites = { '/proj/gamma': true as const, '/proj/alpha': true as const }

    expect(sortReposByFavorite(repos, favorites)).toEqual([
      '/proj/alpha',
      '/proj/gamma',
      '/proj/beta',
      '/proj/zeta',
    ])
  })

  it('is plain alphabetical when nothing is favorited', () => {
    const repos = ['/proj/b', '/proj/a']
    expect(sortReposByFavorite(repos, {})).toEqual(['/proj/a', '/proj/b'])
  })

  it('does not mutate the input array', () => {
    const repos = ['/proj/b', '/proj/a']
    sortReposByFavorite(repos, {})
    expect(repos).toEqual(['/proj/b', '/proj/a'])
  })
})
