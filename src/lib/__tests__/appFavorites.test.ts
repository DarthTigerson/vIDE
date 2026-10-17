import { describe, it, expect } from 'vitest'
import {
  APPEND_TARGET,
  DEFAULT_FAVORITES,
  placeFavorite,
  removeFavorite,
  sanitizeFavorites,
  splitApps,
} from '../appFavorites'

describe('sanitizeFavorites', () => {
  it('falls back to the defaults for anything that is not an array', () => {
    expect(sanitizeFavorites(null)).toEqual(DEFAULT_FAVORITES)
    expect(sanitizeFavorites('docker')).toEqual(DEFAULT_FAVORITES)
  })

  it('keeps an empty list empty (the user unfavorited everything)', () => {
    expect(sanitizeFavorites([])).toEqual([])
  })

  it('drops unknown, locked and duplicate ids', () => {
    expect(sanitizeFavorites(['notes', 'files', 'bogus', 'notes', 'jira', 3])).toEqual(['notes', 'jira'])
  })
})

describe('placeFavorite', () => {
  it('reorders an existing favorite before or after a target', () => {
    expect(placeFavorite(['docker', 'llama', 'notes'], 'notes', 'docker', 'before')).toEqual(['notes', 'docker', 'llama'])
    expect(placeFavorite(['docker', 'llama', 'notes'], 'docker', 'llama', 'after')).toEqual(['llama', 'docker', 'notes'])
  })

  it('favorites a new app at the drop position', () => {
    expect(placeFavorite(['docker', 'llama'], 'jira', 'llama', 'before')).toEqual(['docker', 'jira', 'llama'])
  })

  it('appends when dropped on the All Apps button or any non-favorite target', () => {
    expect(placeFavorite(['docker'], 'notes', APPEND_TARGET, 'before')).toEqual(['docker', 'notes'])
    expect(placeFavorite([], 'notes', APPEND_TARGET, 'after')).toEqual(['notes'])
    expect(placeFavorite(['docker', 'notes'], 'docker', APPEND_TARGET, 'after')).toEqual(['notes', 'docker'])
  })

  it('ignores locked or unknown ids and dropping onto itself', () => {
    const favorites = ['docker', 'llama'] as const
    expect(placeFavorite([...favorites], 'files', 'docker', 'before')).toEqual(favorites)
    expect(placeFavorite([...favorites], 'session-1', 'docker', 'before')).toEqual(favorites)
    expect(placeFavorite([...favorites], 'docker', 'docker', 'after')).toEqual(favorites)
  })
})

describe('removeFavorite', () => {
  it('removes a favorite and ignores anything else', () => {
    expect(removeFavorite(['docker', 'llama'], 'docker')).toEqual(['llama'])
    expect(removeFavorite(['docker'], 'session-1')).toEqual(['docker'])
  })
})

describe('splitApps', () => {
  it('keeps favorites in favorite order and the rest in default order', () => {
    expect(splitApps(['docker', 'llama', 'todos', 'notes', 'jira'], ['notes', 'docker'])).toEqual({
      favorites: ['notes', 'docker'],
      others: ['llama', 'todos', 'jira'],
    })
  })

  it('leaves disabled apps out of both lists', () => {
    expect(splitApps(['notes'], ['docker', 'notes'])).toEqual({ favorites: ['notes'], others: [] })
  })
})
