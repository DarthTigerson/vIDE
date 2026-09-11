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

import { useGitExpandedReposStore } from '../gitExpandedReposStore'

describe('gitExpandedReposStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useGitExpandedReposStore.setState({ expanded: {} })
  })

  it('defaults to expanded only when the repo is the selected repo', () => {
    expect(useGitExpandedReposStore.getState().isExpanded('/proj/repoA', '/proj/repoA')).toBe(true)
    expect(useGitExpandedReposStore.getState().isExpanded('/proj/repoB', '/proj/repoA')).toBe(false)
  })

  it('an explicit setExpanded(false) overrides the selected-repo default', () => {
    useGitExpandedReposStore.getState().setExpanded('/proj/repoA', false)
    expect(useGitExpandedReposStore.getState().isExpanded('/proj/repoA', '/proj/repoA')).toBe(false)
  })

  it('an explicit setExpanded(true) overrides the not-selected default', () => {
    useGitExpandedReposStore.getState().setExpanded('/proj/repoB', true)
    expect(useGitExpandedReposStore.getState().isExpanded('/proj/repoB', '/proj/repoA')).toBe(true)
  })

  it('persists to localStorage and keeps other repos independent', () => {
    useGitExpandedReposStore.getState().setExpanded('/proj/repoA', true)
    useGitExpandedReposStore.getState().setExpanded('/proj/repoB', false)

    expect(JSON.parse(localStorageStore['vide:git:expandedRepos'])).toEqual({
      '/proj/repoA': true,
      '/proj/repoB': false,
    })
  })

  it('reading isExpanded never itself writes to storage', () => {
    useGitExpandedReposStore.getState().isExpanded('/proj/repoA', '/proj/repoA')
    expect(localStorageStore['vide:git:expandedRepos']).toBeUndefined()
  })
})
