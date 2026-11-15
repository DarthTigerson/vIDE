import { describe, it, expect } from 'vitest'
import {
  APPEND_TARGET,
  DEFAULT_FAVORITES,
  placeFavorite,
  removeFavorite,
  sanitizeFavorites,
  splitApps,
  pickTemporaryApp,
} from '../appFavorites'

describe('sanitizeFavorites', () => {
  it('falls back to the defaults for anything that is not an array', () => {
    expect(sanitizeFavorites(null)).toEqual(DEFAULT_FAVORITES)
    expect(sanitizeFavorites('mobile')).toEqual(DEFAULT_FAVORITES)
  })

  it('moves the old built-in docker slot to the Docker store app, idempotently', () => {
    const once = sanitizeFavorites(['notes', 'docker', 'llama'])
    expect(once).toEqual(['notes', 'app:docker', 'llama'])
    expect(sanitizeFavorites(once)).toEqual(once)
    expect(sanitizeFavorites(['docker', 'app:docker'])).toEqual(['app:docker'])
  })

  it('does not favorite docker for new users', () => {
    expect(DEFAULT_FAVORITES).not.toContain('docker')
    expect(DEFAULT_FAVORITES).not.toContain('app:docker')
  })

  it('keeps store app favorites and drops a bare app: prefix', () => {
    expect(sanitizeFavorites(['app:hello', 'app:'])).toEqual(['app:hello'])
  })

  it('keeps an empty list empty (the user unfavorited everything)', () => {
    expect(sanitizeFavorites([])).toEqual([])
  })

  it('drops unknown, locked and duplicate ids', () => {
    expect(sanitizeFavorites(['notes', 'files', 'bogus', 'notes', 'jira', 3])).toEqual(['notes'])
  })
})

describe('placeFavorite', () => {
  it('reorders an existing favorite before or after a target', () => {
    expect(placeFavorite(['mobile', 'llama', 'notes'], 'notes', 'mobile', 'before')).toEqual(['notes', 'mobile', 'llama'])
    expect(placeFavorite(['mobile', 'llama', 'notes'], 'mobile', 'llama', 'after')).toEqual(['llama', 'mobile', 'notes'])
  })

  it('favorites a new app at the drop position', () => {
    expect(placeFavorite(['mobile', 'llama'], 'scripts', 'llama', 'before')).toEqual(['mobile', 'scripts', 'llama'])
  })

  it('appends when dropped on the All Apps button or any non-favorite target', () => {
    expect(placeFavorite(['mobile'], 'notes', APPEND_TARGET, 'before')).toEqual(['mobile', 'notes'])
    expect(placeFavorite([], 'notes', APPEND_TARGET, 'after')).toEqual(['notes'])
    expect(placeFavorite(['mobile', 'notes'], 'mobile', APPEND_TARGET, 'after')).toEqual(['notes', 'mobile'])
  })

  it('ignores locked or unknown ids and dropping onto itself', () => {
    const favorites = ['mobile', 'llama'] as const
    expect(placeFavorite([...favorites], 'files', 'mobile', 'before')).toEqual(favorites)
    expect(placeFavorite([...favorites], 'session-1', 'mobile', 'before')).toEqual(favorites)
    expect(placeFavorite([...favorites], 'mobile', 'mobile', 'after')).toEqual(favorites)
  })
})

describe('removeFavorite', () => {
  it('removes a favorite and ignores anything else', () => {
    expect(removeFavorite(['mobile', 'llama'], 'mobile')).toEqual(['llama'])
    expect(removeFavorite(['mobile'], 'session-1')).toEqual(['mobile'])
  })
})

describe('splitApps', () => {
  it('keeps favorites in favorite order and the rest in default order', () => {
    expect(splitApps(['mobile', 'llama', 'todos', 'notes', 'scripts'], ['notes', 'mobile'])).toEqual({
      favorites: ['notes', 'mobile'],
      others: ['llama', 'todos', 'scripts'],
    })
  })

  it('puts unfavorited store apps after the built-ins', () => {
    expect(splitApps(['app:docker', 'llama', 'app:x'], ['app:x'])).toEqual({
      favorites: ['app:x'],
      others: ['llama', 'app:docker'],
    })
  })

  it('leaves disabled apps out of both lists', () => {
    expect(splitApps(['notes'], ['mobile', 'notes'])).toEqual({ favorites: ['notes'], others: [] })
  })
})

describe('pickTemporaryApp', () => {
  const others = ['mobile', 'notes', 'scripts'] as const

  it('takes the active unfavorited app', () => {
    expect(pickTemporaryApp(others, 'notes', 'mobile')).toBe('notes')
  })

  it('keeps the last one when you switch to something else', () => {
    expect(pickTemporaryApp(others, undefined, 'mobile')).toBe('mobile')
  })

  it('drops the last one once it is no longer unfavorited (or disabled)', () => {
    expect(pickTemporaryApp(others, undefined, 'llama')).toBeNull()
    expect(pickTemporaryApp(others, undefined, null)).toBeNull()
  })
})
