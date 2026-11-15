import { describe, it, expect } from 'vitest'
import { parseVideUrl, videUrlFromArgv } from '../videUrl'

describe('parseVideUrl', () => {
  it('reads the app id from vide://store/<id>', () => {
    expect(parseVideUrl('vide://store/docker')).toEqual({ kind: 'store', id: 'docker' })
    expect(parseVideUrl('vide://store/my-app-2/')).toEqual({ kind: 'store', id: 'my-app-2' })
  })

  it('opens the Store (null id) for a missing or invalid id', () => {
    expect(parseVideUrl('vide://store')).toEqual({ kind: 'store', id: null })
    expect(parseVideUrl('vide://store/')).toEqual({ kind: 'store', id: null })
    expect(parseVideUrl('vide://store/Docker')).toEqual({ kind: 'store', id: null })
    expect(parseVideUrl('vide://store/a/b')).toEqual({ kind: 'store', id: null })
    expect(parseVideUrl('vide://store/..%2Fetc')).toEqual({ kind: 'store', id: null })
    expect(parseVideUrl('vide://store/%E0%A4%A')).toEqual({ kind: 'store', id: null })
  })

  it('ignores other schemes, hosts and junk', () => {
    expect(parseVideUrl('https://store/docker')).toBeNull()
    expect(parseVideUrl('vide://settings/docker')).toBeNull()
    expect(parseVideUrl('not a url')).toBeNull()
    expect(parseVideUrl('')).toBeNull()
    expect(parseVideUrl('vide://store/' + 'a'.repeat(3000))).toBeNull()
  })

  it('ignores query and fragment', () => {
    expect(parseVideUrl('vide://store/docker?x=1#y')).toEqual({ kind: 'store', id: 'docker' })
  })
})

describe('videUrlFromArgv', () => {
  it('finds the vide:// argument', () => {
    expect(videUrlFromArgv(['/usr/bin/vide', '--flag', 'vide://store/docker'])).toBe('vide://store/docker')
  })
  it('is null without one', () => {
    expect(videUrlFromArgv(['/usr/bin/vide', '--flag'])).toBeNull()
  })
})
